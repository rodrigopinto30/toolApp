from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, Path, Query, Request

from app.api.v1.deps import AdminUser, client_ip
from app.core.container import ChangePublisherDep, SessionFactoryDep
from app.core.exceptions import get_request_id
from app.db.unit_of_work import SqlAlchemyUnitOfWork
from app.schemas.admin.common import AdminPageParams
from app.services.admin.audit import AuditLogAdmin
from app.services.admin.catalog import (
    AttributeAdmin,
    AttributeValueAdmin,
    BrandAdmin,
    CategoryAdmin,
)
from app.services.admin.coupons import CouponAdmin
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
CategoryAdminDep = Annotated[CategoryAdmin, Depends(admin_service(CategoryAdmin))]
BrandAdminDep = Annotated[BrandAdmin, Depends(admin_service(BrandAdmin))]
AttributeAdminDep = Annotated[AttributeAdmin, Depends(admin_service(AttributeAdmin))]
AttributeValueAdminDep = Annotated[AttributeValueAdmin, Depends(get_attribute_value_admin)]
ProductAdminDep = Annotated[ProductAdmin, Depends(admin_service(ProductAdmin))]
VariantAdminDep = Annotated[VariantAdmin, Depends(admin_service(VariantAdmin))]
