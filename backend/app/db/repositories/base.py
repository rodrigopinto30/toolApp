from collections.abc import Sequence
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import ColumnElement

from app.db.base import Base


class SqlAlchemyRepository[ModelT: Base]:
    """Generic data access for one model. Aggregate repositories (ProductRepository...)
    subclass it and add their own queries. It never commits: the Unit of Work does."""

    model: type[ModelT]

    def __init__(self, session: AsyncSession, model: type[ModelT] | None = None) -> None:
        self.session = session
        if model is not None:
            self.model = model

    async def get(self, entity_id: Any) -> ModelT | None:
        return await self.session.get(self.model, entity_id)

    async def get_by(self, **filters: Any) -> ModelT | None:
        result = await self.session.scalars(select(self.model).filter_by(**filters).limit(1))
        return result.first()

    async def list(
        self,
        *,
        offset: int = 0,
        limit: int = 100,
        order_by: Sequence[ColumnElement[Any]] = (),
        **filters: Any,
    ) -> Sequence[ModelT]:
        statement = select(self.model).filter_by(**filters).order_by(*order_by)
        result = await self.session.scalars(statement.offset(offset).limit(limit))
        return result.all()

    async def count(self, **filters: Any) -> int:
        statement = select(func.count()).select_from(self.model).filter_by(**filters)
        return (await self.session.scalar(statement)) or 0

    async def exists(self, **filters: Any) -> bool:
        statement = select(1).select_from(self.model).filter_by(**filters).limit(1)
        return (await self.session.scalar(statement)) is not None

    def add(self, entity: ModelT) -> ModelT:
        self.session.add(entity)
        return entity

    def add_all(self, entities: Sequence[ModelT]) -> None:
        self.session.add_all(entities)

    async def delete(self, entity: ModelT) -> None:
        await self.session.delete(entity)
