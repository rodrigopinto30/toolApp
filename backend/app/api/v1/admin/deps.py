from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, HTTPException, Path, Query, Request, UploadFile

from app.api.v1.deps import AdminUser, client_ip
from app.core.container import (
    ChangePublisherDep,
    ImageStorageDep,
    SessionFactoryDep,
    SettingsDep,
)
from app.core.exceptions import get_request_id
from app.db.unit_of_work import SqlAlchemyUnitOfWork
from app.media.storage import ImageStorage
from app.schemas.admin.common import AdminPageParams
from app.services.admin.audit import AuditLogAdmin
from app.services.admin.catalog import (
    AttributeAdmin,
    AttributeValueAdmin,
    BrandAdmin,
    CategoryAdmin,
)
from app.services.admin.coupons import CouponAdmin
from app.services.admin.media import ImageAdmin
from app.services.admin.pricing import (
    ExchangeRateAdmin,
    PickupPointAdmin,
    ProvinceAdmin,
    ZoneAdmin,
)
from app.services.admin.products import ProductAdmin, VariantAdmin
from app.services.audit import AuditTrail
from app.services.revalidation import ChangePublisher

EntityId = Annotated[int, Path(gt=0)]
PageParams = Annotated[AdminPageParams, Query()]


def get_audit_trail(request: Request, admin: AdminUser) -> AuditTrail:
    return AuditTrail(admin.id, client_ip(request), get_request_id(request))


AuditTrailDep = Annotated[AuditTrail, Depends(get_audit_trail)]


def admin_service[ServiceT](
    service: Callable[[SqlAlchemyUnitOfWork, AuditTrail, ChangePublisher], ServiceT],
) -> Callable[..., ServiceT]:
    def factory(
        session_factory: SessionFactoryDep, audit: AuditTrailDep, changes: ChangePublisherDep
    ) -> ServiceT:
        return service(SqlAlchemyUnitOfWork(session_factory), audit, changes)

    return factory


def media_service[ServiceT](
    service: Callable[[SqlAlchemyUnitOfWork, AuditTrail, ChangePublisher, ImageStorage], ServiceT],
) -> Callable[..., ServiceT]:
    def factory(
        session_factory: SessionFactoryDep,
        audit: AuditTrailDep,
        changes: ChangePublisherDep,
        storage: ImageStorageDep,
    ) -> ServiceT:
        return service(SqlAlchemyUnitOfWork(session_factory), audit, changes, storage)

    return factory


async def get_image_bytes(file: UploadFile, settings: SettingsDep) -> bytes:
    data = await file.read(settings.max_image_bytes + 1)
    if len(data) > settings.max_image_bytes:
        raise HTTPException(status_code=413)
    return data


ImageBytes = Annotated[bytes, Depends(get_image_bytes)]


def get_audit_log_admin(session_factory: SessionFactoryDep) -> AuditLogAdmin:
    return AuditLogAdmin(SqlAlchemyUnitOfWork(session_factory))


def get_attribute_value_admin(
    attribute_id: EntityId,
    session_factory: SessionFactoryDep,
    audit: AuditTrailDep,
    changes: ChangePublisherDep,
) -> AttributeValueAdmin:
    return AttributeValueAdmin(SqlAlchemyUnitOfWork(session_factory), audit, changes, attribute_id)


ExchangeRateAdminDep = Annotated[ExchangeRateAdmin, Depends(admin_service(ExchangeRateAdmin))]
ZoneAdminDep = Annotated[ZoneAdmin, Depends(admin_service(ZoneAdmin))]
ProvinceAdminDep = Annotated[ProvinceAdmin, Depends(admin_service(ProvinceAdmin))]
PickupPointAdminDep = Annotated[PickupPointAdmin, Depends(admin_service(PickupPointAdmin))]
CouponAdminDep = Annotated[CouponAdmin, Depends(admin_service(CouponAdmin))]
AuditLogAdminDep = Annotated[AuditLogAdmin, Depends(get_audit_log_admin)]
CategoryAdminDep = Annotated[CategoryAdmin, Depends(media_service(CategoryAdmin))]
BrandAdminDep = Annotated[BrandAdmin, Depends(media_service(BrandAdmin))]
AttributeAdminDep = Annotated[AttributeAdmin, Depends(admin_service(AttributeAdmin))]
AttributeValueAdminDep = Annotated[AttributeValueAdmin, Depends(get_attribute_value_admin)]
ProductAdminDep = Annotated[ProductAdmin, Depends(admin_service(ProductAdmin))]
VariantAdminDep = Annotated[VariantAdmin, Depends(admin_service(VariantAdmin))]
ImageAdminDep = Annotated[ImageAdmin, Depends(media_service(ImageAdmin))]
