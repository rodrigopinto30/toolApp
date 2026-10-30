from collections.abc import Mapping
from typing import Any

from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm.interfaces import ORMOption
from sqlalchemy.sql import ColumnElement

from app.core.exceptions import AppError, ConflictError, NotFoundError
from app.db.base import Base
from app.db.unit_of_work import SqlAlchemyUnitOfWork
from app.schemas.admin.common import AdminPageParams
from app.schemas.common import Page, PatchModel, ReadModel
from app.services.audit import AuditTrail, diff, snapshot
from app.services.revalidation import ChangePublisher


def taken(field: str) -> ConflictError:
    return ConflictError(f"That {field} is already in use.", code=f"{field}_taken")


class AdminResource[ModelT: Base, ReadT: ReadModel]:
    model: type[ModelT]
    read: type[ReadT]
    entity: str
    fields: tuple[str, ...]
    ordering: tuple[ColumnElement[Any], ...]
    key: str = "id"
    namespaces: tuple[str, ...] = ()
    load: tuple[ORMOption, ...] = ()

    def __init__(
        self, uow: SqlAlchemyUnitOfWork, audit: AuditTrail, changes: ChangePublisher
    ) -> None:
        self.uow = uow
        self.audit = audit
        self.changes = changes
        self.scope: dict[str, Any] = {}

    def conflict(self) -> AppError:
        return ConflictError()

    async def validate(self, state: Mapping[str, Any], entity: ModelT | None) -> None:
        return None

    async def page(self, params: AdminPageParams) -> Page[ReadT]:
        async with self.uow:
            repository = self.uow.repository(self.model)
            rows = await repository.list(
                offset=params.offset,
                limit=params.size,
                order_by=self.ordering,
                options=self.load,
                **self.scope,
            )
            total = await repository.count(**self.scope)
            items = [self._present(row) for row in rows]
        return Page.of(items, page=params.page, size=params.size, total=total)

    async def detail(self, key: int | str) -> ReadT:
        async with self.uow:
            entity = await self.uow.repository(self.model).get_by(
                options=self.load, **self.scope, **{self.key: key}
            )
            if entity is None:
                raise NotFoundError()
            return self._present(entity)

    async def create(self, body: BaseModel, **extra: Any) -> ReadT:
        values = {**body.model_dump(), **extra, **self.scope}
        async with self.uow:
            await self.validate(values, None)
            entity = self.uow.repository(self.model).add(await self._build(values))
            saved = await self._save(entity)
            self.audit.record(
                self.uow.session,
                "create",
                self.entity,
                getattr(saved, self.key),
                diff({}, self._state(saved)),
            )
            result = self._present(saved)
        await self.changes.publish(*self.namespaces)
        return result

    async def update(self, key: int | str, body: PatchModel) -> ReadT:
        return await self._change(key, body.changes(), "update")

    async def archive(self, key: int | str) -> ReadT:
        return await self._change(key, {"is_active": False}, "archive")

    async def delete(self, key: int | str) -> None:
        async with self.uow:
            entity = await self._load(key)
            changes = diff(self._state(entity), {})
            try:
                await self._remove(entity)
                await self.uow.flush()
            except IntegrityError as exc:
                raise self._in_use() from exc
            self.audit.record(self.uow.session, "delete", self.entity, key, changes)
        await self.changes.publish(*self.namespaces)

    def _in_use(self) -> ConflictError:
        return ConflictError("It is in use and cannot be deleted.", code="in_use")

    def _present(self, entity: ModelT) -> ReadT:
        return self.read.model_validate(entity)

    def _state(self, entity: ModelT) -> dict[str, Any]:
        return snapshot(entity, self.fields)

    async def _build(self, values: dict[str, Any]) -> ModelT:
        return self.model(**values)

    async def _apply(self, entity: ModelT, values: Mapping[str, Any]) -> None:
        for field, value in values.items():
            setattr(entity, field, value)

    async def _remove(self, entity: ModelT) -> None:
        await self.uow.repository(self.model).delete(entity)

    async def _load(self, key: int | str) -> ModelT:
        entity = await self.uow.repository(self.model).get_locked(
            options=self.load, **self.scope, **{self.key: key}
        )
        if entity is None:
            raise NotFoundError()
        return entity

    async def _save(self, entity: ModelT) -> ModelT:
        try:
            await self.uow.flush()
        except IntegrityError as exc:
            raise self.conflict() from exc
        return await self.uow.repository(self.model).get_fresh(
            options=self.load, **{self.key: getattr(entity, self.key)}
        )

    async def _change(self, key: int | str, values: dict[str, Any], action: str) -> ReadT:
        async with self.uow:
            entity = await self._load(key)
            before = self._state(entity)
            await self.validate({**before, **values}, entity)
            await self._apply(entity, values)
            saved = await self._save(entity)
            changes = diff(before, self._state(saved))
            if changes:
                self.audit.record(self.uow.session, action, self.entity, key, changes)
            result = self._present(saved)
        if changes:
            await self.changes.publish(*self.namespaces)
        return result
