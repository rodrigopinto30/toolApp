from collections.abc import Sequence
from decimal import Decimal

from app.core.config import Settings
from app.core.exceptions import BusinessRuleViolation, ConflictError, NotFoundError
from app.db.repositories.catalog import ProductRepository
from app.db.repositories.purchase import CartRepository
from app.db.unit_of_work import SqlAlchemyUnitOfWork
from app.models import Cart, CartItem, Currency, Locale, ProductVariant
from app.schemas.cart import (
    CartAdjustment,
    CartAdjustmentReason,
    CartLine,
    CartLineIssue,
    CartMergeRead,
    CartMergeRequest,
    CartRead,
)
from app.schemas.common import MAX_LINES, Money
from app.services.catalog import product_image, product_translation, stock_status
from app.services.pricing import PriceConverter, PricingService


def is_purchasable(variant: ProductVariant) -> bool:
    product = variant.product
    return (
        variant.is_active
        and product.is_active
        and product.category.is_active
        and (product.brand is None or product.brand.is_active)
    )


def variant_label(variant: ProductVariant, locale: Locale) -> str | None:
    values = sorted(variant.attribute_values, key=lambda value: value.attribute_id)
    return " / ".join(value.value[locale] for value in values) or None


def line_issue(variant: ProductVariant, quantity: int) -> CartLineIssue | None:
    if not is_purchasable(variant):
        return CartLineIssue.UNAVAILABLE
    if variant.stock <= 0:
        return CartLineIssue.OUT_OF_STOCK
    if quantity > variant.stock:
        return CartLineIssue.INSUFFICIENT_STOCK
    return None


class CartService:
    def __init__(self, uow: SqlAlchemyUnitOfWork, pricing: PricingService, settings: Settings) -> None:
        self.uow = uow
        self.pricing = pricing
        self.settings = settings

    async def get(self, user_id: int, currency: Currency, locale: Locale) -> CartRead:
        converter = await self.pricing.converter(currency)
        async with self.uow:
            cart = await CartRepository(self.uow.session).for_user(user_id)
            return await self._read(cart, converter, currency, locale)

    async def set_quantity(
        self, user_id: int, variant_id: int, quantity: int, currency: Currency, locale: Locale
    ) -> CartRead:
        converter = await self.pricing.converter(currency)
        async with self.uow:
            variant = (await self._variants([variant_id])).get(variant_id)
            if variant is None or not is_purchasable(variant):
                raise NotFoundError("Product not found.")
            if quantity > variant.stock:
                raise ConflictError(
                    "There is not enough stock.",
                    code="insufficient_stock",
                    details={"available": variant.stock},
                )
            cart = await CartRepository(self.uow.session).lock_or_create(user_id)
            line = next((item for item in cart.items if item.variant_id == variant_id), None)
            if line is not None:
                line.quantity = quantity
            elif len(cart.items) >= MAX_LINES:
                raise BusinessRuleViolation("The cart is full.", code="cart_limit")
            else:
                cart.items.append(CartItem(variant_id=variant_id, quantity=quantity))
            await self.uow.flush()
            return await self._read(cart, converter, currency, locale)

    async def remove(self, user_id: int, variant_id: int) -> None:
        async with self.uow:
            await CartRepository(self.uow.session).remove_item(user_id, variant_id)

    async def merge(
        self, user_id: int, request: CartMergeRequest, currency: Currency, locale: Locale
    ) -> CartMergeRead:
        converter = await self.pricing.converter(currency)
        requested: dict[int, int] = {}
        for item in request.items:
            requested[item.variant_id] = max(requested.get(item.variant_id, 0), item.quantity)

        adjustments: list[CartAdjustment] = []
        async with self.uow:
            cart = await CartRepository(self.uow.session).lock_or_create(user_id)
            variants = await self._variants(list(requested))
            lines = {item.variant_id: item for item in cart.items}
            for variant_id, quantity in requested.items():
                adjustment = self._merge_line(cart, lines, variants.get(variant_id), variant_id, quantity)
                if adjustment is not None:
                    adjustments.append(adjustment)
            await self.uow.flush()
            return CartMergeRead(
                cart=await self._read(cart, converter, currency, locale), adjustments=adjustments
            )

    def _merge_line(
        self,
        cart: Cart,
        lines: dict[int, CartItem],
        variant: ProductVariant | None,
        variant_id: int,
        quantity: int,
    ) -> CartAdjustment | None:
        def adjustment(applied: int, reason: CartAdjustmentReason) -> CartAdjustment:
            return CartAdjustment(variant_id=variant_id, requested=quantity, applied=applied, reason=reason)

        if variant is None or not is_purchasable(variant):
            return adjustment(0, CartAdjustmentReason.UNAVAILABLE)
        line = lines.get(variant_id)
        target = max(line.quantity if line else 0, min(quantity, variant.stock))
        if line is None and target > 0 and len(lines) >= MAX_LINES:
            return adjustment(0, CartAdjustmentReason.CART_LIMIT)
        if line is not None:
            line.quantity = target
        elif target > 0:
            lines[variant_id] = CartItem(variant_id=variant_id, quantity=target)
            cart.items.append(lines[variant_id])
        return adjustment(target, CartAdjustmentReason.INSUFFICIENT_STOCK) if target < quantity else None

    async def _variants(self, variant_ids: Sequence[int]) -> dict[int, ProductVariant]:
        variants = await ProductRepository(self.uow.session).variants_with_details(variant_ids)
        return {variant.id: variant for variant in variants}

    async def _read(
        self, cart: Cart | None, converter: PriceConverter, currency: Currency, locale: Locale
    ) -> CartRead:
        items = sorted(cart.items, key=lambda item: item.id) if cart else []
        variants = await self._variants([item.variant_id for item in items])
        lines = [
            self._line(item.quantity, variants[item.variant_id], converter, currency, locale)
            for item in items
            if item.variant_id in variants
        ]
        subtotal = sum((line.line_total.amount for line in lines if line.issue is None), Decimal(0))
        return CartRead(
            items=lines,
            item_count=sum(line.quantity for line in lines),
            subtotal=Money(amount=subtotal, currency=currency),
            has_issues=any(line.issue is not None for line in lines),
            currency=currency,
        )

    def _line(
        self,
        quantity: int,
        variant: ProductVariant,
        converter: PriceConverter,
        currency: Currency,
        locale: Locale,
    ) -> CartLine:
        product = variant.product
        translation = product_translation(product, locale)
        unit_price = converter.money(variant.price_usd, currency)
        issue = line_issue(variant, quantity)
        return CartLine(
            variant_id=variant.id,
            sku=variant.sku,
            product_slug=product.slug,
            product_name=translation.name,
            variant_label=variant_label(variant, locale),
            image=product_image(product.images[0], locale, translation.name) if product.images else None,
            quantity=quantity,
            unit_price=unit_price,
            line_total=Money(amount=unit_price.amount * quantity, currency=currency),
            stock_status=stock_status(variant.stock, self.settings.low_stock_threshold),
            issue=issue,
            available=variant.stock if issue == CartLineIssue.INSUFFICIENT_STOCK else None,
        )
