from datetime import UTC, datetime
from decimal import Decimal
from types import SimpleNamespace

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditLog, CouponType
from app.services.audit import MASK, AuditTrail, diff, plain, snapshot
from tests.factories import make_user


def test_snapshot_reads_only_the_listed_fields() -> None:
    entity = SimpleNamespace(code="A", value=1, secret="no")

    assert snapshot(entity, ("code", "value")) == {"code": "A", "value": 1}


def test_plain_turns_values_into_json_types() -> None:
    moment = datetime(2026, 10, 30, 12, 0, tzinfo=UTC)

    assert plain(Decimal("10.50")) == "10.50"
    assert plain(moment) == "2026-10-30T12:00:00+00:00"
    assert plain(CouponType.PERCENT) == "percent"
    assert plain({"a": [Decimal("1.00")]}) == {"a": ["1.00"]}


def test_diff_keeps_only_what_changed() -> None:
    before = {"code": "A", "value": Decimal("10.00"), "name": {"es": "a"}}
    after = {"code": "B", "value": Decimal("10"), "name": {"es": "a"}}

    assert diff(before, after) == {"code": {"before": "A", "after": "B"}}


def test_diff_of_a_creation_and_a_deletion() -> None:
    values = {"code": "A", "ends_at": None}

    assert diff({}, values) == {"code": {"before": None, "after": "A"}}
    assert diff(values, {}) == {"code": {"before": "A", "after": None}}


@pytest.mark.parametrize(
    "field", ["password", "password_hash", "reset_token", "api_secret", "PASSWORD"]
)
def test_sensitive_fields_never_keep_their_value(field: str) -> None:
    assert diff({field: "old"}, {field: "new"}) == {field: {"before": MASK, "after": MASK}}


async def test_record_adds_the_row_with_its_context(session: AsyncSession) -> None:
    user = await make_user(session)

    AuditTrail(user.id, "10.0.0.1", "req-1").record(
        session, "update", "coupon", 7, {"code": {"before": "A", "after": "B"}}
    )
    await session.flush()

    log = await session.scalar(select(AuditLog).where(AuditLog.actor_id == user.id))
    assert log is not None
    assert (log.action, log.entity, log.entity_id) == ("update", "coupon", "7")
    assert (log.ip, log.request_id) == ("10.0.0.1", "req-1")
    assert log.changes == {"code": {"before": "A", "after": "B"}}
