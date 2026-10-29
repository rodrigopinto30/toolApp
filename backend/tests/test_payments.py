from datetime import UTC, datetime
from decimal import Decimal

import pytest

from app.models import Currency
from app.payments.cards import Card, card_brand, is_expired, parse_expiry, valid_number
from app.payments.circuit_breaker import BreakerState, CircuitBreaker
from app.payments.gateway import (
    ChargeResult,
    ChargeStatus,
    GatewayError,
    MockPaymentGateway,
    PaymentGateway,
    PaymentUnavailable,
)
from app.schemas.common import Money

AMOUNT = Money(amount=Decimal("10.00"), currency=Currency.USD)


class FakeClock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


class FailingProvider:
    name = "failing"

    def __init__(self) -> None:
        self.calls = 0

    async def charge(self, amount: Money, card: Card) -> ChargeResult:
        self.calls += 1
        raise GatewayError

    async def refund(self, provider_ref: str) -> None:
        return None


def _card(number: str = "4242424242424242") -> Card:
    return Card(number=number, expiry_month=12, expiry_year=2030, cvc="123", holder="Ana Diaz")


def _breaker(clock: FakeClock) -> CircuitBreaker:
    return CircuitBreaker(failure_threshold=3, reset_seconds=30, clock=clock)


@pytest.mark.parametrize(
    ("number", "valid"),
    [
        ("4242424242424242", True),
        ("4000000000000002", True),
        ("4000000000090003", True),
        ("378282246310005", True),
        ("4242424242424241", False),
        ("424242424242", False),
        ("42424242424242424242", False),
        ("4242abcd42424242", False),
    ],
)
def test_card_numbers_need_13_to_19_digits_and_a_valid_luhn_check(number: str, valid: bool) -> None:
    assert valid_number(number) is valid


@pytest.mark.parametrize(
    ("number", "brand"),
    [
        ("4242424242424242", "visa"),
        ("5555555555554444", "mastercard"),
        ("2223003122003222", "mastercard"),
        ("378282246310005", "amex"),
        ("6011111111111117", "card"),
    ],
)
def test_card_brand(number: str, brand: str) -> None:
    assert card_brand(number) == brand


def test_expiry_is_valid_through_the_end_of_its_month() -> None:
    now = datetime(2026, 10, 29, tzinfo=UTC)

    assert parse_expiry("10/26") == (10, 2026)
    assert not is_expired(10, 2026, now)
    assert is_expired(9, 2026, now)
    assert parse_expiry("13/26") is None
    assert parse_expiry("1/26") is None


def test_card_repr_hides_the_number() -> None:
    assert "4242" not in repr(_card())


def test_breaker_opens_after_consecutive_failures_and_lets_one_trial_through() -> None:
    clock = FakeClock()
    breaker = _breaker(clock)

    for _ in range(3):
        assert breaker.acquire()
        breaker.record_failure()
    assert breaker.state == BreakerState.OPEN
    assert not breaker.available()
    assert not breaker.acquire()

    clock.now = 30
    assert breaker.state == BreakerState.HALF_OPEN
    assert breaker.acquire()
    assert not breaker.acquire()

    breaker.record_success()
    assert breaker.state == BreakerState.CLOSED


def test_a_failed_trial_opens_the_breaker_again() -> None:
    clock = FakeClock()
    breaker = _breaker(clock)
    for _ in range(3):
        breaker.record_failure()
    clock.now = 30

    assert breaker.acquire()
    breaker.record_failure()

    assert breaker.state == BreakerState.OPEN
    clock.now = 59
    assert not breaker.available()


def test_a_success_resets_the_failure_count() -> None:
    breaker = _breaker(FakeClock())

    breaker.record_failure()
    breaker.record_failure()
    breaker.record_success()
    breaker.record_failure()

    assert breaker.state == BreakerState.CLOSED


@pytest.mark.parametrize(
    ("number", "status"),
    [("4242424242424242", ChargeStatus.APPROVED), ("4000000000000002", ChargeStatus.REJECTED)],
)
async def test_mock_gateway_outcomes(number: str, status: ChargeStatus) -> None:
    result = await MockPaymentGateway(slow_seconds=1).charge(AMOUNT, _card(number))

    assert result.status == status
    assert result.provider_ref.startswith("mock_")
    assert result.sanitized() == {"status": status, "brand": "visa", "last4": number[-4:]}


async def test_a_rejection_is_not_a_breaker_failure() -> None:
    clock = FakeClock()
    gateway = PaymentGateway(MockPaymentGateway(slow_seconds=1), _breaker(clock), timeout_seconds=1)

    for _ in range(4):
        result = await gateway.charge(AMOUNT, _card("4000000000000002"))
        assert result.status == ChargeStatus.REJECTED

    assert gateway.available()


async def test_timeouts_open_the_breaker() -> None:
    clock = FakeClock()
    gateway = PaymentGateway(
        MockPaymentGateway(slow_seconds=1), _breaker(clock), timeout_seconds=0.01
    )

    for _ in range(3):
        with pytest.raises(PaymentUnavailable):
            await gateway.charge(AMOUNT, _card("4000000000090003"))

    assert not gateway.available()
    with pytest.raises(PaymentUnavailable):
        await gateway.charge(AMOUNT, _card())


async def test_provider_errors_count_as_failures_and_an_open_breaker_skips_the_call() -> None:
    provider = FailingProvider()
    gateway = PaymentGateway(provider, _breaker(FakeClock()), timeout_seconds=1)

    for _ in range(4):
        with pytest.raises(PaymentUnavailable):
            await gateway.charge(AMOUNT, _card())

    assert provider.calls == 3
