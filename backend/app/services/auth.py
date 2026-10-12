from dataclasses import dataclass

import structlog
from sqlalchemy.exc import IntegrityError

from app.auth.rate_limit import LoginLockout, RateLimiter, subject_key
from app.auth.sessions import RefreshSession, RefreshSessionStore
from app.auth.tokens import OneTimeTokenStore, TokenPurpose
from app.core.config import Settings
from app.core.exceptions import (
    AppError,
    BadRequestError,
    ForbiddenError,
    TooManyRequestsError,
    UnauthorizedError,
)
from app.core.security import (
    create_access_token,
    decode_access_token,
    dummy_password_hash,
    hash_password,
    password_needs_rehash,
    verify_password,
)
from app.db.repositories.identity import UserRepository
from app.db.types import utcnow
from app.db.unit_of_work import SqlAlchemyUnitOfWork
from app.email.mailer import Mailer
from app.models import Locale, User
from app.schemas.auth import (
    ForgotPasswordRequest,
    LoginRequest,
    RegisterRequest,
    ResetPasswordRequest,
)

logger = structlog.get_logger(__name__)


@dataclass(frozen=True)
class SessionTokens:
    access_token: str
    refresh_token: str


@dataclass(frozen=True)
class AuthResult:
    user: User
    tokens: SessionTokens


class AuthService:
    def __init__(
        self,
        uow: SqlAlchemyUnitOfWork,
        sessions: RefreshSessionStore,
        tokens: OneTimeTokenStore,
        lockout: LoginLockout,
        limiter: RateLimiter,
        mailer: Mailer,
        settings: Settings,
    ) -> None:
        self.uow = uow
        self.sessions = sessions
        self.tokens = tokens
        self.lockout = lockout
        self.limiter = limiter
        self.mailer = mailer
        self.settings = settings

    def session_tokens(self, user: User, session: RefreshSession) -> SessionTokens:
        access_token = create_access_token(
            self.settings, user_id=user.id, role=user.role, session_id=session.family_id
        )
        return SessionTokens(access_token, session.refresh_token)

    async def authenticate(self, access_token: str) -> User:
        claims = decode_access_token(self.settings, access_token)
        async with self.uow:
            user = await UserRepository(self.uow.session).get(claims.user_id)
        if user is None or not user.is_active:
            raise UnauthorizedError()
        return user

    async def register(self, request: RegisterRequest) -> None:
        password_hash = hash_password(request.password)
        try:
            async with self.uow:
                users = UserRepository(self.uow.session)
                existing = await users.get_by_email(request.email)
                if existing is not None:
                    self.mailer.account_exists(existing, request.locale)
                    return
                user = users.add(
                    User(
                        email=request.email,
                        password_hash=password_hash,
                        first_name=request.first_name,
                        last_name=request.last_name,
                        phone=request.phone,
                    )
                )
                await self.uow.flush()
                token = await self.tokens.issue(
                    TokenPurpose.VERIFY_EMAIL, user.id, self.settings.verify_email_token_ttl
                )
        except IntegrityError:
            logger.info("register_race_lost")
            return
        logger.info("user_registered", user_id=user.id)
        self.mailer.verify_email(user, token, request.locale)

    async def login(self, request: LoginRequest) -> AuthResult:
        await self.limiter.hit("login-email", subject_key(request.email), limit=20, window=3600)
        await self.lockout.check(request.email)
        async with self.uow:
            user = await UserRepository(self.uow.session).get_by_email(request.email)
            password_hash = user.password_hash if user is not None else dummy_password_hash()
            if not verify_password(password_hash, request.password) or user is None:
                await self.lockout.register_failure(request.email)
                logger.info("login_failed", user_id=user.id if user else None)
                raise UnauthorizedError("Invalid email or password.", code="invalid_credentials")
            if not user.is_active:
                raise ForbiddenError("The account is disabled.", code="account_disabled")
            if password_needs_rehash(user.password_hash):
                user.password_hash = hash_password(request.password)
            user.last_login_at = utcnow()
            session = await self.sessions.create(user.id)
        await self.lockout.reset(request.email)
        logger.info("login_succeeded", user_id=user.id)
        return AuthResult(user, self.session_tokens(user, session))

    async def refresh(self, refresh_token: str) -> AuthResult:
        session = await self.sessions.rotate(refresh_token)
        async with self.uow:
            user = await UserRepository(self.uow.session).get(session.user_id)
        if user is None or not user.is_active:
            await self.sessions.revoke_family(session.family_id)
            raise UnauthorizedError()
        return AuthResult(user, self.session_tokens(user, session))

    async def logout(self, refresh_token: str | None, access_token: str | None) -> None:
        try:
            family_id = await self.sessions.family_of(refresh_token) if refresh_token else None
            if family_id is None and access_token:
                try:
                    family_id = decode_access_token(self.settings, access_token).session_id
                except UnauthorizedError:
                    family_id = None
            if family_id is not None:
                await self.sessions.revoke_family(family_id)
        except AppError as exc:
            logger.warning("logout_revoke_failed", code=exc.code)

    async def verify_email(self, token: str) -> None:
        user_id = await self.tokens.consume(TokenPurpose.VERIFY_EMAIL, token)
        if user_id is None:
            raise BadRequestError("The link is invalid or has expired.", code="invalid_token")
        async with self.uow:
            user = await UserRepository(self.uow.session).get(user_id)
            if user is None:
                raise BadRequestError("The link is invalid or has expired.", code="invalid_token")
            if user.email_verified_at is None:
                user.email_verified_at = utcnow()
        logger.info("email_verified", user_id=user_id)

    async def resend_verification(self, user: User, locale: Locale) -> None:
        if user.email_verified_at is not None:
            return
        token = await self.tokens.issue(
            TokenPurpose.VERIFY_EMAIL, user.id, self.settings.verify_email_token_ttl
        )
        self.mailer.verify_email(user, token, locale)

    async def forgot_password(self, request: ForgotPasswordRequest) -> None:
        try:
            await self.limiter.hit(
                "forgot-email", subject_key(request.email), limit=3, window=900
            )
        except TooManyRequestsError:
            return
        async with self.uow:
            user = await UserRepository(self.uow.session).get_by_email(request.email)
        if user is None or not user.is_active:
            return
        token = await self.tokens.issue(
            TokenPurpose.RESET_PASSWORD, user.id, self.settings.reset_password_token_ttl
        )
        self.mailer.reset_password(user, token, request.locale)

    async def reset_password(self, request: ResetPasswordRequest) -> None:
        user_id = await self.tokens.consume(TokenPurpose.RESET_PASSWORD, request.token)
        if user_id is None:
            raise BadRequestError("The link is invalid or has expired.", code="invalid_token")
        async with self.uow:
            user = await UserRepository(self.uow.session).get(user_id)
            if user is None or not user.is_active:
                raise BadRequestError("The link is invalid or has expired.", code="invalid_token")
            user.password_hash = hash_password(request.password)
            if user.email_verified_at is None:
                user.email_verified_at = utcnow()
            await self.sessions.revoke_user(user.id)
        logger.info("password_reset", user_id=user.id)
        self.mailer.password_changed(user, request.locale)
