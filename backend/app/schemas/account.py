from datetime import datetime
from typing import Annotated, Literal, Self

from pydantic import BaseModel, StringConstraints, model_validator

from app.models import Locale, TaxCondition, TaxIdType, User, UserRole
from app.schemas.common import PatchModel, ReadModel, RequestModel
from app.schemas.validators import (
    AnyPassword,
    Name,
    Password,
    Phone,
    PostalCode,
    TaxId,
    check_tax_identity,
    text,
)

Label = Annotated[str, text(40)]
Street = Annotated[str, text(120)]
StreetNumber = Annotated[str, text(20)]
FloorApt = Annotated[str, text(20)]
City = Annotated[str, text(80)]
ProvinceCode = Annotated[str, StringConstraints(strip_whitespace=True, min_length=4, max_length=8)]
Notes = Annotated[str, text(255)]
LegalName = Annotated[str, text(160)]
FiscalAddress = Annotated[str, text(255)]


class MeRead(BaseModel):
    id: int
    email: str
    first_name: str
    last_name: str
    phone: str | None
    role: UserRole
    email_verified: bool
    created_at: datetime

    @classmethod
    def from_user(cls, user: User) -> Self:
        return cls(
            id=user.id,
            email=user.email,
            first_name=user.first_name,
            last_name=user.last_name,
            phone=user.phone,
            role=user.role,
            email_verified=user.email_verified_at is not None,
            created_at=user.created_at,
        )


class MeUpdate(PatchModel):
    nullable = frozenset({"phone"})

    first_name: Name | None = None
    last_name: Name | None = None
    phone: Phone | None = None


class PasswordChange(RequestModel):
    current_password: AnyPassword
    new_password: Password
    locale: Locale = Locale.ES


class ProvinceRef(ReadModel):
    code: str
    name: str


class AddressRead(ReadModel):
    id: int
    label: str
    recipient_name: str
    phone: str
    street: str
    number: str
    floor_apt: str | None
    city: str
    province: ProvinceRef
    postal_code: str
    notes: str | None
    is_default: bool


class AddressCreate(RequestModel):
    label: Label
    recipient_name: Name
    phone: Phone
    street: Street
    number: StreetNumber
    floor_apt: FloorApt | None = None
    city: City
    province_code: ProvinceCode
    postal_code: PostalCode
    notes: Notes | None = None
    is_default: bool = False


class AddressUpdate(PatchModel):
    nullable = frozenset({"floor_apt", "notes"})

    label: Label | None = None
    recipient_name: Name | None = None
    phone: Phone | None = None
    street: Street | None = None
    number: StreetNumber | None = None
    floor_apt: FloorApt | None = None
    city: City | None = None
    province_code: ProvinceCode | None = None
    postal_code: PostalCode | None = None
    notes: Notes | None = None
    is_default: Literal[True] | None = None


class BillingProfileRead(ReadModel):
    id: int
    tax_id_type: TaxIdType
    tax_id: str
    tax_condition: TaxCondition
    legal_name: str
    fiscal_address: str
    is_default: bool


class BillingProfileCreate(RequestModel):
    tax_id_type: TaxIdType
    tax_id: TaxId
    tax_condition: TaxCondition
    legal_name: LegalName
    fiscal_address: FiscalAddress
    is_default: bool = False

    @model_validator(mode="after")
    def check_tax_identity(self) -> Self:
        check_tax_identity(self.tax_id_type, self.tax_id, self.tax_condition)
        return self


class BillingProfileUpdate(PatchModel):
    tax_id_type: TaxIdType | None = None
    tax_id: TaxId | None = None
    tax_condition: TaxCondition | None = None
    legal_name: LegalName | None = None
    fiscal_address: FiscalAddress | None = None
    is_default: Literal[True] | None = None
