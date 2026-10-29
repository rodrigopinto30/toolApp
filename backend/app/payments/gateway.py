import asyncio
import uuid
from dataclasses import dataclass
from enum import StrEnum
from typing import Protocol

import structlog

from app.core.config import Settings
from app.payments.cards import Card
from app.payments.circuit_breaker import CircuitBreaker
from app.schemas.common import Money

logger = structlog.get_logger(__name__)

REJECTED_SUFFIX = "0002"
SLOW_SUFFIX = "0003"


class ChargeStatus(StrEnum):
    APPROVED = "approved"
    REJECTED = "rejected"


@dataclass(frozen=True)
class ChargeResult:
    status: ChargeStatus
    provider_ref: str
    brand: str
    last4: str

    def sanitized(self) -> dict[str, str]:
        return {"status": self.status, "brand": self.brand, "last4": self.last4}


class GatewayError(Exception):
    pass


class PaymentUnavailable(Exception):
    pass


class PaymentProvider(Protocol):
    name: str

    async def charge(self, amount: Money, card: Card) -> ChargeResult: ...

    async def refund(self, provider_ref: str) -> None: ...


class MockPaymentGateway:
    name = "mock"

    def __init__(self, *, slow_seconds: float) -> None:
        self.slow_seconds = slow_seconds

    async def charge(self, amount: Money, card: Card) -> ChargeResult:
        if card.last4 == SLOW_SUFFIX:
            await asyncio.sleep(self.slow_seconds)
        status = ChargeStatus.REJECTED if card.last4 == REJECTED_SUFFIX else ChargeStatus.APPROVED
        return ChargeResult(status, f"mock_{uuid.uuid4().hex}", card.brand, card.last4)

    async def refund(self, provider_ref: str) -> None:
        return None


class PaymentGateway:
    def __init__(
        self, provider: PaymentProvider, breaker: CircuitBreaker, *, timeout_seconds: float
    ) -> None:
        self.provider = provider
        self.breaker = breaker
        self.timeout_seconds = timeout_seconds

    @property
    def name(self) -> str:
        return self.provider.name

    def available(self) -> bool:
        return self.breaker.available()

    async def charge(self, amount: Money, card: Card) -> ChargeResult:
        if not self.breaker.acquire():
            raise PaymentUnavailable
        try:
            async with asyncio.timeout(self.timeout_seconds):
                result = await self.provider.charge(amount, card)
        except (TimeoutError, GatewayError) as exc:
            self.breaker.record_failure()
            logger.warning("payment_unavailable", provider=self.name, error=type(exc).__name__)
            raise PaymentUnavailable from exc
        self.breaker.record_success()
        return result

    async def refund(self, provider_ref: str) -> None:
        async with asyncio.timeout(self.timeout_seconds):
            await self.provider.refund(provider_ref)


def create_payment_gateway(settings: Settings) -> PaymentGateway:
    return PaymentGateway(
        MockPaymentGateway(slow_seconds=settings.payment_timeout_seconds + 1),
        CircuitBreaker(
            failure_threshold=settings.payment_breaker_failures,
            reset_seconds=settings.payment_breaker_reset_seconds,
        ),
        timeout_seconds=settings.payment_timeout_seconds,
    )
