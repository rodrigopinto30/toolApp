import asyncio
import smtplib
from dataclasses import dataclass
from email.message import EmailMessage as MimeMessage
from typing import Protocol

import structlog
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from app.core.config import Settings

logger = structlog.get_logger(__name__)


@dataclass(frozen=True)
class EmailMessage:
    template: str
    to: str
    subject: str
    text: str
    html: str


class EmailSender(Protocol):
    async def send(self, message: EmailMessage) -> None: ...


class SmtpEmailSender:
    def __init__(self, host: str, port: int, sender: str, *, timeout: float = 10.0) -> None:
        self.host = host
        self.port = port
        self.sender = sender
        self.timeout = timeout

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=0.5, max=4),
        retry=retry_if_exception_type((smtplib.SMTPException, OSError)),
        reraise=True,
    )
    async def send(self, message: EmailMessage) -> None:
        await asyncio.to_thread(self._send, message)

    def _send(self, message: EmailMessage) -> None:
        mime = MimeMessage()
        mime["From"] = self.sender
        mime["To"] = message.to
        mime["Subject"] = message.subject
        mime.set_content(message.text)
        mime.add_alternative(message.html, subtype="html")
        with smtplib.SMTP(self.host, self.port, timeout=self.timeout) as smtp:
            smtp.send_message(mime)


class LogEmailSender:
    """Used when no SMTP server is configured. Never logs the body: it contains tokens."""

    async def send(self, message: EmailMessage) -> None:
        logger.info(
            "email_suppressed",
            template=message.template,
            recipient_domain=message.to.rpartition("@")[2],
        )


def create_email_sender(settings: Settings) -> EmailSender:
    if settings.smtp_host:
        return SmtpEmailSender(settings.smtp_host, settings.smtp_port, settings.smtp_from)
    return LogEmailSender()


async def deliver(sender: EmailSender, message: EmailMessage) -> None:
    try:
        await sender.send(message)
    except Exception as exc:
        logger.error("email_failed", template=message.template, error=str(exc))
    else:
        logger.info("email_sent", template=message.template)
