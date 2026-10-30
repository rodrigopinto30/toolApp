from collections.abc import Mapping
from typing import Any

from sqlalchemy.orm import selectinload

from app.core.exceptions import AppError, BusinessRuleViolation, ConflictError, NotFoundError
from app.db.repositories.catalog import CategoryRepository
from app.db.unit_of_work import SqlAlchemyUnitOfWork
from app.models import Attribute, AttributeValue, Brand, Category
from app.schemas.admin.catalog import (
    AdminAttributeRead,
    AdminAttributeValueRead,
    AdminBrandRead,
    AdminCategoryRead,
)
from app.services.admin.base import AdminResource, taken
from app.services.admin.media import PictureResource
from app.services.audit import AuditTrail
from app.services.revalidation import ChangePublisher

MAX_CATEGORY_DEPTH = 3


def _height(parents: Mapping[int, int | None], category_id: int) -> int:
    children = [child for child, parent in parents.items() if parent == category_id]
    return 1 + max((_height(parents, child) for child in children), default=0)


def check_category_parent(
    parents: Mapping[int, int | None], category_id: int | None, parent_id: int | None
) -> None:
    ancestors = 0
    current = parent_id
    while current is not None:
        if current not in parents:
            raise BusinessRuleViolation("Unknown parent category.", code="unknown_parent")
        if current == category_id:
            raise BusinessRuleViolation(
                "A category cannot be moved under itself.", code="category_cycle"
            )
        ancestors += 1
        current = parents[current]
    height = 1 if category_id is None else _height(parents, category_id)
    if ancestors + height > MAX_CATEGORY_DEPTH:
        raise BusinessRuleViolation(
            f"The category tree has up to {MAX_CATEGORY_DEPTH} levels.", code="category_too_deep"
        )


class CategoryAdmin(PictureResource[Category, AdminCategoryRead]):
    model = Category
    read = AdminCategoryRead
    entity = "category"
    fields = ("parent_id", "slug", "name", "description", "position", "is_active", "image_path")
    ordering = (Category.parent_id, Category.position, Category.id)
    namespaces = ("catalog",)
    column = "image_path"
    folder = "categories"

    def conflict(self) -> AppError:
        return taken("slug")

    async def validate(self, state: Mapping[str, Any], entity: Category | None) -> None:
        moved = entity is None or state["parent_id"] != entity.parent_id
        if moved:
            parents = await CategoryRepository(self.uow.session).parents()
            check_category_parent(parents, entity.id if entity else None, state["parent_id"])
        repository = self.uow.repository(Category)
        if state["is_active"] and state["parent_id"] is not None:
            if not await repository.exists(id=state["parent_id"], is_active=True):
                raise BusinessRuleViolation(
                    "An active category needs an active parent.", code="inactive_parent"
                )
        if entity is not None and entity.is_active and not state["is_active"]:
            if await repository.exists(parent_id=entity.id, is_active=True):
                raise ConflictError(
                    "Deactivate its subcategories first.", code="active_children"
                )

    async def _load(self, key: int | str) -> Category:
        await CategoryRepository(self.uow.session).lock_tree()
        return await super()._load(key)

    async def _remove(self, entity: Category) -> None:
        if await self.uow.repository(Category).exists(parent_id=entity.id):
            raise self._in_use()
        await super()._remove(entity)


class BrandAdmin(PictureResource[Brand, AdminBrandRead]):
    model = Brand
    read = AdminBrandRead
    entity = "brand"
    fields = ("slug", "name", "is_active", "logo_path")
    ordering = (Brand.name, Brand.id)
    namespaces = ("catalog",)
    column = "logo_path"
    folder = "brands"

    def conflict(self) -> AppError:
        return taken("slug")


class AttributeAdmin(AdminResource[Attribute, AdminAttributeRead]):
    model = Attribute
    read = AdminAttributeRead
    entity = "attribute"
    fields = ("code", "name", "is_filterable")
    ordering = (Attribute.id,)
    namespaces = ("catalog",)
    load = (selectinload(Attribute.values),)

    def conflict(self) -> AppError:
        return taken("code")

    def _state(self, entity: Attribute) -> dict[str, Any]:
        return {**super()._state(entity), "values": sorted(value.slug for value in entity.values)}

    async def _remove(self, entity: Attribute) -> None:
        for value in entity.values:
            await self.uow.repository(AttributeValue).delete(value)
        await super()._remove(entity)


class AttributeValueAdmin(AdminResource[AttributeValue, AdminAttributeValueRead]):
    model = AttributeValue
    read = AdminAttributeValueRead
    entity = "attribute_value"
    fields = ("attribute_id", "slug", "value", "position")
    ordering = (AttributeValue.position, AttributeValue.id)
    namespaces = ("catalog",)

    def __init__(
        self,
        uow: SqlAlchemyUnitOfWork,
        audit: AuditTrail,
        changes: ChangePublisher,
        attribute_id: int,
    ) -> None:
        super().__init__(uow, audit, changes)
        self.scope = {"attribute_id": attribute_id}

    def conflict(self) -> AppError:
        return taken("slug")

    async def validate(self, state: Mapping[str, Any], entity: AttributeValue | None) -> None:
        if entity is None:
            if not await self.uow.repository(Attribute).exists(id=state["attribute_id"]):
                raise NotFoundError()
