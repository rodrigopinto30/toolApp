import structlog

from app.core.config import Settings
from app.email.mailer import Mailer
from app.email.sender import EmailMessage, LogEmailSender
from app.email.templates import TEMPLATES, render
from app.models import Locale, User


def test_every_template_exists_in_every_locale() -> None:
    for name, translations in TEMPLATES.items():
        assert set(translations) == set(Locale), name


def test_render_escapes_html() -> None:
    message = render(
        "verify_email",
        Locale.EN,
        to="a@example.com",
        first_name="<b>Ana</b>",
        link="https://x/?a=1&b=2",
    )

    assert "<b>Ana</b>" in message.text
    assert "&lt;b&gt;Ana&lt;/b&gt;" in message.html
    assert 'href="https://x/?a=1&amp;b=2"' in message.html


def test_mailer_builds_links_from_public_url(settings: Settings) -> None:
    scheduled: list[EmailMessage] = []
    mailer = Mailer(settings, scheduled.append)
    user = User(email="ana@example.com", first_name="Ana")

    mailer.reset_password(user, "abc123", Locale.ES)

    [message] = scheduled
    assert message.to == "ana@example.com"
    assert f"{settings.public_url}/reset-password?token=abc123" in message.text
    assert message.subject == "Recuperá tu contraseña"


async def test_log_sender_never_logs_the_body() -> None:
    link = "https://x/?token=secret"
    message = render("reset_password", Locale.EN, to="ana@example.com", first_name="Ana", link=link)

    with structlog.testing.capture_logs() as logs:
        await LogEmailSender().send(message)

    assert logs == [
        {
            "template": "reset_password",
            "recipient_domain": "example.com",
            "event": "email_suppressed",
            "log_level": "info",
        }
    ]
