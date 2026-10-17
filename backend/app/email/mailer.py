from collections.abc import Callable
from urllib.parse import urlencode

from app.core.config import Settings
from app.email.sender import EmailMessage
from app.email.templates import render
from app.models import Locale, User


class Mailer:
    """Builds the account emails and hands them to `schedule` (a background task in the API),
    so sending never delays the response and its timing does not reveal whether an account
    exists."""

    def __init__(self, settings: Settings, schedule: Callable[[EmailMessage], None]) -> None:
        self.settings = settings
        self.schedule = schedule

    def _link(self, locale: Locale, path: str, token: str | None = None) -> str:
        """The token goes in the fragment: browsers never send it to a server, so it stays
        out of access logs, Referer headers and link scanners (which would use it up)."""
        fragment = f"#{urlencode({'token': token})}" if token else ""
        return f"{self.settings.public_url}/{locale}{path}{fragment}"

    def _send(self, name: str, user: User, locale: Locale, link: str | None = None) -> None:
        self.schedule(render(name, locale, to=user.email, first_name=user.first_name, link=link))

    def verify_email(self, user: User, token: str, locale: Locale) -> None:
        self._send("verify_email", user, locale, self._link(locale, "/verify-email", token))

    def account_exists(self, user: User, locale: Locale) -> None:
        self._send("account_exists", user, locale, self._link(locale, "/forgot-password"))

    def reset_password(self, user: User, token: str, locale: Locale) -> None:
        self._send("reset_password", user, locale, self._link(locale, "/reset-password", token))

    def password_changed(self, user: User, locale: Locale) -> None:
        self._send("password_changed", user, locale)
