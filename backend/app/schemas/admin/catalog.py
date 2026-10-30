from typing import Annotated, ClassVar

from pydantic import Field, StringConstraints

from app.schemas.admin.common import I18nDescription, I18nText, Position, slug
from app.schemas.common import PatchModel, ReadModel, RequestModel
from app.schemas.validators import text

CategorySlug = Annotated[str, slug(120)]
BrandSlug = Annotated[str, slug(120)]
BrandName = Annotated[str, text(120)]
ValueSlug = Annotated[str, slug(60)]
AttributeCode = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        to_lower=True,
        min_length=1,
        max_length=40,
        pattern=r"^[A-Za-z0-9_]+$",
    ),
]


class CategoryCreate(RequestModel):
    slug: CategorySlug
    name: I18nText
    description: I18nDescription | None = None
    parent_id: int | None = Field(None, gt=0)
    position: Position = 0
    is_active: bool = True


class CategoryUpdate(PatchModel):
    nullable: ClassVar[frozenset[str]] = frozenset({"description", "parent_id"})

    slug: CategorySlug | None = None
    name: I18nText | None = None
    description: I18nDescription | None = None
    parent_id: int | None = Field(None, gt=0)
    position: Position | None = None
    is_active: bool | None = None


class AdminCategoryRead(ReadModel):
    id: int
    parent_id: int | None
    slug: str
    name: I18nText
    description: I18nDescription | None
    position: int
    is_active: bool


class BrandCreate(RequestModel):
    slug: BrandSlug
    name: BrandName
    is_active: bool = True


class BrandUpdate(PatchModel):
    slug: BrandSlug | None = None
    name: BrandName | None = None
    is_active: bool | None = None


class AdminBrandRead(ReadModel):
    id: int
    slug: str
    name: str
    is_active: bool


class AttributeValueCreate(RequestModel):
    slug: ValueSlug
    value: I18nText
    position: Position = 0


class AttributeValueUpdate(PatchModel):
    slug: ValueSlug | None = None
    value: I18nText | None = None
    position: Position | None = None


class AdminAttributeValueRead(ReadModel):
    id: int
    attribute_id: int
    slug: str
    value: I18nText
    position: int


class AttributeCreate(RequestModel):
    code: AttributeCode
    name: I18nText
    is_filterable: bool = True


class AttributeUpdate(PatchModel):
    code: AttributeCode | None = None
    name: I18nText | None = None
    is_filterable: bool | None = None


class AdminAttributeRead(ReadModel):
    id: int
    code: str
    name: I18nText
    is_filterable: bool
    values: list[AdminAttributeValueRead]
