import uuid
from typing import Any

from httpx import AsyncClient, Response
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Address,
    BillingProfile,
    Order,
    OrderStatus,
    Product,
    ProductVariant,
    Province,
    TaxCondition,
    TaxIdType,
    User,
)
from tests.factories import build_address

PASSWORD = "a-long-password"
CHECKOUT = "/api/v1/checkout"
CARD = {"card_number": "4242 4242 4242 4242", "expiry": "12/30", "cvc": "123", "holder": "Ana Diaz"}
REJECTED_CARD = CARD | {"card_number": "4000 0000 0000 0002"}
SLOW_CARD = CARD | {"card_number": "4000-0000-0009-0003"}


async def login(client: AsyncClient, user: User) -> None:
    response = await client.post(
        "/api/v1/auth/login", json={"email": user.email, "password": PASSWORD}
    )
    assert response.status_code == 200


async def variant_id(session: AsyncSession, sku: str) -> int:
    return await session.scalar(select(ProductVariant.id).where(ProductVariant.sku == sku))


async def product_of(session: AsyncSession, sku: str) -> Product:
    statement = (
        select(Product)
        .join(ProductVariant, ProductVariant.product_id == Product.id)
        .where(ProductVariant.sku == sku)
    )
    return (await session.scalars(statement)).one()


async def deliver(session: AsyncSession, number: str) -> None:
    await session.execute(
        update(Order).where(Order.number == number).values(status=OrderStatus.DELIVERED)
    )


async def stock(session: AsyncSession, sku: str) -> int:
    return await session.scalar(select(ProductVariant.stock).where(ProductVariant.sku == sku))


async def count(session: AsyncSession, model: Any, *conditions: Any) -> int:
    return await session.scalar(select(func.count()).select_from(model).where(*conditions)) or 0


async def add_to_cart(client: AsyncClient, session: AsyncSession, sku: str, quantity: int) -> None:
    path = f"/api/v1/me/cart/items/{await variant_id(session, sku)}"
    response = await client.put(path, json={"quantity": quantity})
    assert response.status_code == 200


async def cart_quantities(client: AsyncClient) -> dict[str, int]:
    cart = (await client.get("/api/v1/me/cart", params={"currency": "USD"})).json()
    return {line["sku"]: line["quantity"] for line in cart["items"]}


async def address_for(session: AsyncSession, user: User, province_code: str = "AR-C") -> Address:
    province = (await session.scalars(select(Province).where(Province.code == province_code))).one()
    address = build_address(user, province, is_default=True)
    session.add(address)
    await session.flush()
    return address


async def billing_profile(session: AsyncSession, user: User) -> BillingProfile:
    profile = BillingProfile(
        user_id=user.id,
        tax_id_type=TaxIdType.DNI,
        tax_id="12345678",
        tax_condition=TaxCondition.FINAL_CONSUMER,
        legal_name="Ana Diaz",
        fiscal_address="Calle Falsa 123, CABA",
    )
    session.add(profile)
    await session.flush()
    return profile


def shipping_body(address: Address, **body: Any) -> dict[str, Any]:
    return {"delivery_method": "shipping", "address_id": address.id, "currency": "USD"} | body


def pickup_body(pickup_point_id: int, **body: Any) -> dict[str, Any]:
    return {"delivery_method": "pickup", "pickup_point_id": pickup_point_id, "currency": "USD"} | body


async def place_order(
    client: AsyncClient,
    body: dict[str, Any],
    *,
    card: dict[str, str] = CARD,
    key: str | None = None,
    total: dict[str, str] | None = None,
    locale: str = "es",
) -> Response:
    if total is None:
        preview = await client.post(f"{CHECKOUT}/preview", json=body)
        assert preview.status_code == 200, preview.json()
        total = preview.json()["total"]
    headers = {"Idempotency-Key": key or uuid.uuid4().hex}
    payload = body | {"expected_total": total, "payment": card}
    return await client.post(
        CHECKOUT, json=payload, headers=headers, params={"locale": locale}
    )
