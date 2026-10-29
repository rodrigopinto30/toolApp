import re
from dataclasses import dataclass
from decimal import Decimal
from enum import StrEnum
from typing import Any

from sqlalchemy import ColumnElement, Select, exists, select, true
from sqlalchemy.dialects.mysql import match as fulltext_match
from sqlalchemy.orm import aliased

from app.models import (
    Attribute,
    AttributeValue,
    Brand,
    Product,
    ProductTranslation,
    ProductVariant,
    variant_attribute_values,
)

MIN_FULLTEXT_TOKEN = 3

type AttributeSelection = tuple[tuple[str, tuple[str, ...]], ...]


class ProductSort(StrEnum):
    RELEVANCE = "relevance"
    NEWEST = "newest"
    PRICE_ASC = "price_asc"
    PRICE_DESC = "price_desc"
    NAME = "name"


@dataclass(frozen=True)
class ProductQueryColumns:
    translation: Any
    price_from: ColumnElement[Decimal]
    max_stock: ColumnElement[int]


@dataclass(frozen=True)
class ProductFilter:
    q: str | None = None
    category_ids: tuple[int, ...] | None = None
    brand_slugs: tuple[str, ...] = ()
    attributes: AttributeSelection = ()
    min_price_usd: Decimal | None = None
    max_price_usd: Decimal | None = None
    in_stock: bool = False
    sort: ProductSort = ProductSort.NEWEST

    def apply(self, statement: Select[Any], columns: ProductQueryColumns) -> Select[Any]:
        translation = columns.translation
        relevance = None
        if self.q:
            tokens = [t for t in re.findall(r"\w+", self.q) if len(t) >= MIN_FULLTEXT_TOKEN]
            if tokens:
                relevance = fulltext_match(
                    translation.name,
                    translation.short_description,
                    against=" ".join(f"+{token}*" for token in tokens),
                ).in_boolean_mode()
                statement = statement.where(relevance)
            else:
                statement = statement.where(translation.name.contains(self.q, autoescape=True))

        if self.category_ids is not None:
            statement = statement.where(Product.category_id.in_(self.category_ids))
        if self.brand_slugs:
            brand_ids = select(Brand.id).where(Brand.slug.in_(self.brand_slugs))
            statement = statement.where(Product.brand_id.in_(brand_ids))
        if self.attributes:
            statement = statement.where(self._variant_matches_attributes())
        if self.min_price_usd is not None:
            statement = statement.where(columns.price_from >= self.min_price_usd)
        if self.max_price_usd is not None:
            statement = statement.where(columns.price_from <= self.max_price_usd)
        if self.in_stock:
            statement = statement.where(columns.max_stock > 0)

        return statement.order_by(*self._order_by(columns, relevance))

    def _variant_matches_attributes(self) -> ColumnElement[bool]:
        variant = aliased(ProductVariant)
        return exists(
            select(1)
            .select_from(variant)
            .where(
                variant.product_id == Product.id,
                variant.is_active.is_(true()),
                *variant_attribute_conditions(variant, self.attributes),
            )
        )

    def _order_by(
        self, columns: ProductQueryColumns, relevance: ColumnElement[Any] | None
    ) -> list[ColumnElement[Any]]:
        translation: ProductTranslation = columns.translation
        match self.sort:
            case ProductSort.RELEVANCE if relevance is not None:
                return [relevance.desc(), Product.id.desc()]
            case ProductSort.PRICE_ASC:
                return [columns.price_from.asc(), Product.id.asc()]
            case ProductSort.PRICE_DESC:
                return [columns.price_from.desc(), Product.id.desc()]
            case ProductSort.NAME:
                return [translation.name.asc(), Product.id.asc()]
            case _:
                return [Product.created_at.desc(), Product.id.desc()]


def variant_attribute_conditions(
    variant: Any, attributes: AttributeSelection
) -> list[ColumnElement[bool]]:
    links = variant_attribute_values.alias()
    value = aliased(AttributeValue)
    attribute = aliased(Attribute)
    return [
        exists(
            select(1)
            .select_from(links)
            .join(value, value.id == links.c.attribute_value_id)
            .join(attribute, attribute.id == value.attribute_id)
            .where(links.c.variant_id == variant.id, attribute.code == code, value.slug.in_(slugs))
        )
        for code, slugs in attributes
    ]
