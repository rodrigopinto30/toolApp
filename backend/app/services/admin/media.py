from collections.abc import Mapping
from typing import Any

from app.core.exceptions import BusinessRuleViolation, ConflictError, NotFoundError
from app.db.base import Base
from app.db.repositories.catalog import ProductRepository
from app.db.unit_of_work import SqlAlchemyUnitOfWork
from app.media.images import process_image
from app.media.storage import ImageStorage
from app.models import Product, ProductImage, ProductVariant
from app.schemas.admin.products import AdminImageRead
from app.schemas.common import ReadModel
from app.services.admin.base import AdminResource
from app.services.audit import AuditTrail
from app.services.revalidation import ChangePublisher

MAX_PRODUCT_IMAGES = 12


class PictureResource[ModelT: Base, ReadT: ReadModel](AdminResource[ModelT, ReadT]):
    column: str
    folder: str

    def __init__(
        self,
        uow: SqlAlchemyUnitOfWork,
        audit: AuditTrail,
        changes: ChangePublisher,
        storage: ImageStorage,
    ) -> None:
        super().__init__(uow, audit, changes)
        self.storage = storage
        self._replaced: str | None = None

    async def set_picture(self, key: int, data: bytes) -> ReadT:
        await self.detail(key)
        path = await self.storage.save(f"{self.folder}/{key}", await process_image(data))
        try:
            result = await self._change(key, {self.column: path}, "update")
        except Exception:
            await self.storage.delete(path)
            raise
        await self._discard_replaced()
        return result

    async def clear_picture(self, key: int) -> ReadT:
        result = await self._change(key, {self.column: None}, "update")
        await self._discard_replaced()
        return result

    async def _apply(self, entity: ModelT, values: Mapping[str, Any]) -> None:
        if self.column in values:
            self._replaced = getattr(entity, self.column)
        await super()._apply(entity, values)

    async def _after_delete(self, entity: ModelT) -> None:
        path = getattr(entity, self.column)
        if path:
            await self.storage.delete(path)

    async def _discard_replaced(self) -> None:
        if self._replaced:
            await self.storage.delete(self._replaced)


class ImageAdmin(AdminResource[ProductImage, AdminImageRead]):
    model = ProductImage
    read = AdminImageRead
    entity = "product_image"
    fields = ("product_id", "path", "alt", "position", "variant_id", "width", "height")
    ordering = (ProductImage.position, ProductImage.id)
    namespaces = ("catalog",)

    def __init__(
        self,
        uow: SqlAlchemyUnitOfWork,
        audit: AuditTrail,
        changes: ChangePublisher,
        storage: ImageStorage,
    ) -> None:
        super().__init__(uow, audit, changes)
        self.storage = storage

    async def upload(self, product_id: int, data: bytes) -> AdminImageRead:
        async with self.uow:
            if not await self.uow.repository(Product).exists(id=product_id):
                raise NotFoundError()
        processed = await process_image(data)
        path = await self.storage.save(f"products/{product_id}", processed)
        try:
            return await self._insert(
                {
                    "product_id": product_id,
                    "path": path,
                    "width": processed.width,
                    "height": processed.height,
                }
            )
        except Exception:
            await self.storage.delete(path)
            raise

    async def validate(self, state: Mapping[str, Any], entity: ProductImage | None) -> None:
        if entity is None:
            await self._check_capacity(state["product_id"])
            return
        variant_id = state["variant_id"]
        if variant_id is not None and variant_id != entity.variant_id:
            variants = self.uow.repository(ProductVariant)
            if not await variants.exists(id=variant_id, product_id=entity.product_id):
                raise BusinessRuleViolation(
                    "The variant does not belong to this product.", code="unknown_variant"
                )

    async def _check_capacity(self, product_id: int) -> None:
        if await self.uow.repository(Product).get_locked(id=product_id) is None:
            raise NotFoundError()
        if await self.uow.repository(ProductImage).count(product_id=product_id) >= MAX_PRODUCT_IMAGES:
            raise ConflictError(
                f"A product has up to {MAX_PRODUCT_IMAGES} images.", code="too_many_images"
            )

    async def _build(self, values: dict[str, Any]) -> ProductImage:
        repository = ProductRepository(self.uow.session)
        position = await repository.next_image_position(values["product_id"])
        return ProductImage(**values, position=position)

    async def _after_delete(self, entity: ProductImage) -> None:
        await self.storage.delete(entity.path)
