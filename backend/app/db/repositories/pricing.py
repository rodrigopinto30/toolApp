from collections.abc import Sequence

from sqlalchemy import select, true
from sqlalchemy.orm import selectinload

from app.db.repositories.base import SqlAlchemyRepository
from app.models import ExchangeRate, PickupPoint, Province


class ExchangeRateRepository(SqlAlchemyRepository[ExchangeRate]):
    model = ExchangeRate

    async def latest(self) -> ExchangeRate | None:
        statement = select(ExchangeRate).order_by(ExchangeRate.id.desc()).limit(1)
        return await self.session.scalar(statement)


class ProvinceRepository(SqlAlchemyRepository[Province]):
    model = Province

    async def list_with_zone(self) -> Sequence[Province]:
        statement = select(Province).options(selectinload(Province.zone)).order_by(Province.name)
        return (await self.session.scalars(statement)).all()

    async def get_with_zone(self, code: str) -> Province | None:
        statement = (
            select(Province).where(Province.code == code).options(selectinload(Province.zone))
        )
        return await self.session.scalar(statement)


class PickupPointRepository(SqlAlchemyRepository[PickupPoint]):
    model = PickupPoint

    async def list_active(self) -> Sequence[PickupPoint]:
        statement = (
            select(PickupPoint).where(PickupPoint.is_active.is_(true())).order_by(PickupPoint.id)
        )
        return (await self.session.scalars(statement)).all()
