from fastapi import APIRouter, Depends, Request, Response, status

from app.api.v1.cookies import clear_session_cookies, set_csrf_cookie, set_session_cookies
from app.api.v1.deps import CurrentUser, ip_rate_limit, user_rate_limit
from app.api.v1.params import LocaleQuery
from app.core.container import AuthServiceDep, SettingsDep
from app.core.exceptions import UnauthorizedError
from app.core.security import ACCESS_COOKIE, REFRESH_COOKIE
from app.models import Locale
from app.schemas.account import MeRead
from app.schemas.auth import (
    AcceptedRead,
    ForgotPasswordRequest,
    LoginRequest,
    RegisterRequest,
    ResetPasswordRequest,
    VerifyEmailRequest,
)

router = APIRouter(prefix="/auth", tags=["auth"])

ACCEPTED = AcceptedRead(message="If the request is valid, we sent you an email.")


@router.get("/csrf", status_code=status.HTTP_204_NO_CONTENT)
async def issue_csrf_token(response: Response, settings: SettingsDep) -> None:
    set_csrf_cookie(response, settings)


@router.post(
    "/register",
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(ip_rate_limit("register", limit=5, window=3600))],
)
async def register(body: RegisterRequest, auth: AuthServiceDep) -> AcceptedRead:
    await auth.register(body)
    return ACCEPTED


@router.post("/login", dependencies=[Depends(ip_rate_limit("login", limit=5, window=60))])
async def login(
    body: LoginRequest, response: Response, auth: AuthServiceDep, settings: SettingsDep
) -> MeRead:
    result = await auth.login(body)
    set_session_cookies(response, settings, result.tokens)
    return MeRead.from_user(result.user)


@router.post("/refresh", dependencies=[Depends(ip_rate_limit("refresh", limit=30, window=60))])
async def refresh(
    request: Request, response: Response, auth: AuthServiceDep, settings: SettingsDep
) -> MeRead:
    token = request.cookies.get(REFRESH_COOKIE)
    if not token:
        raise UnauthorizedError()
    result = await auth.refresh(token)
    set_session_cookies(response, settings, result.tokens)
    return MeRead.from_user(result.user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request, response: Response, auth: AuthServiceDep, settings: SettingsDep
) -> None:
    await auth.logout(request.cookies.get(REFRESH_COOKIE), request.cookies.get(ACCESS_COOKIE))
    clear_session_cookies(response, settings)


@router.post(
    "/verify-email",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(ip_rate_limit("verify-email", limit=10, window=900))],
)
async def verify_email(body: VerifyEmailRequest, auth: AuthServiceDep) -> None:
    await auth.verify_email(body.token)


@router.post(
    "/resend-verification",
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[
        Depends(user_rate_limit("resend-minute", limit=1, window=60)),
        Depends(user_rate_limit("resend-day", limit=5, window=86400)),
    ],
)
async def resend_verification(
    user: CurrentUser, auth: AuthServiceDep, locale: LocaleQuery = Locale.ES
) -> AcceptedRead:
    await auth.resend_verification(user, locale)
    return ACCEPTED


@router.post(
    "/forgot-password",
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(ip_rate_limit("forgot-password", limit=3, window=900))],
)
async def forgot_password(body: ForgotPasswordRequest, auth: AuthServiceDep) -> AcceptedRead:
    await auth.forgot_password(body)
    return ACCEPTED


@router.post(
    "/reset-password",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(ip_rate_limit("reset-password", limit=10, window=900))],
)
async def reset_password(body: ResetPasswordRequest, auth: AuthServiceDep) -> None:
    await auth.reset_password(body)
