from collections.abc import Mapping
from typing import Any

from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.sql import ColumnElement

from app.core.exceptions import AppError, ConflictError, NotFoundError
from app.db.base import Base
from app.db.unit_of_work import SqlAlchemyUnitOfWork
from app.schemas.admin.common import AdminPageParams
from app.schemas.common import Page, PatchModel, ReadModel
from app.services.audit import AuditTrail, diff, snapshot
from app.services.revalidation import ChangePublisher


def code_taken() -> ConflictError:
    return ConflictError("That code is already in use.", code="code_taken")


class AdminResource[ModelT: Base, ReadT: ReadModel]:
    model: type[ModelT]
    read: type[ReadT]
    entity: str
    fields: tuple[str, ...]
    ordering: tuple[ColumnElement[Any], ...]
    key: str = "id"
    namespaces: tuple[str, ...] = ()

    def __init__(
        self, uow: SqlAlchemyUnitOfWork, audit: AuditTrail, changes: ChangePublisher
    ) -> None:
        self.uow = uow
        self.audit = audit
        self.changes = changes

    def conflict(self) -> AppError:
        return ConflictError()

    async def validate(self, state: Mapping[str, Any], entity: ModelT | None) -> None:
        return None

    async def page(self, params: AdminPageParams) -> Page[ReadT]:
        async with self.uow:
            repository = self.uow.repository(self.model)
            rows = await repository.list(
                offset=params.offset, limit=params.size, order_by=self.ordering
            )
            total = await repository.count()
            items = [self.read.model_validate(row) for row in rows]
        return Page.of(items, page=params.page, size=params.size, total=total)

    async def detail(self, key: int | str) -> ReadT:
        async with self.uow:
            entity = await self.uow.repository(self.model).get_by(**{self.key: key})
            if entity is None:
                raise NotFoundError()
            return self.read.model_validate(entity)

    async def create(self, body: BaseModel, **extra: Any) -> ReadT:
        values = body.model_dump()
        async with self.uow:
            await self.validate(values, None)
            entity = self.uow.repository(self.model).add(self.model(**values, **extra))
            await self._save(entity)
            changes = diff({}, snapshot(entity, self.fields))
            self.audit.record(
                self.uow.session, "create", self.entity, getattr(entity, self.key), changes
            )
            result = self.read.model_validate(entity)
        await self.changes.publish(*self.namespaces)
        return result

    async def update(self, key: int | str, body: PatchModel) -> ReadT:
        values = body.changes()
        async with self.uow:
            entity = await self._locked(key)
            before = snapshot(entity, self.fields)
            await self.validate({**before, **values}, entity)
            for field, value in values.items():
                setattr(entity, field, value)
            await self._save(entity)
            changes = diff(before, snapshot(entity, self.fields))
            if changes:
                self.audit.record(self.uow.session, "update", self.entity, key, changes)
            result = self.read.model_validate(entity)
        if changes:
            await self.changes.publish(*self.namespaces)
        return result

    async def delete(self, key: int | str) -> None:
        async with self.uow:
            entity = await self._locked(key)
            changes = diff(snapshot(entity, self.fields), {})
            await self.uow.repository(self.model).delete(entity)
            await self._flush(ConflictError("It is in use and cannot be deleted.", code="in_use"))
            self.audit.record(self.uow.session, "delete", self.entity, key, changes)
        await self.changes.publish(*self.namespaces)

    async def _locked(self, key: int | str) -> ModelT:
        entity = await self.uow.repository(self.model).get_locked(**{self.key: key})
        if entity is None:
            raise NotFoundError()
        return entity

    async def _save(self, entity: ModelT) -> None:
        await self._flush(self.conflict())
        await self.uow.session.refresh(entity)

    async def _flush(self, error: AppError) -> None:
        try:
            await self.uow.flush()
        except IntegrityError as exc:
            raise error from exc
