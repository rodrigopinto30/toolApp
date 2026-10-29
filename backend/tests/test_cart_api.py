from typing import Any

import pytest
from httpx import AsyncClient, Response
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import ACCESS_COOKIE
from app.models import (
    Brand,
    Cart,
    CartItem,
    Category,
    Locale,
    Product,
    ProductTranslation,
    ProductVariant,
    User,
)
from tests.factories import make_user, make_variant

pytestmark = pytest.mark.usefixtures("seeded")

PASSWORD = "a-long-password"
CART = "/api/v1/me/cart"
USD = {"currency": "USD"}


@pytest.fixture
async def user(client: AsyncClient, session: AsyncSession) -> User:
    user = await make_user(session, password=PASSWORD)
    response = await client.post(
        "/api/v1/auth/login", json={"email": user.email, "password": PASSWORD}
    )
    assert response.status_code == 200
    return user


async def _variant_id(session: AsyncSession, sku: str) -> int:
    return await session.scalar(select(ProductVariant.id).where(ProductVariant.sku == sku))


async def _put(client: AsyncClient, variant_id: int, quantity: int, **params: Any) -> Response:
    return await client.put(
        f"{CART}/items/{variant_id}", json={"quantity": quantity}, params=params or USD
    )


async def _merge(client: AsyncClient, items: list[tuple[int, int]]) -> dict[str, Any]:
    body = {"items": [{"variant_id": v, "quantity": q} for v, q in items]}
    response = await client.post(f"{CART}/merge", json=body, params=USD)
    assert response.status_code == 200
    return response.json()


def _quantities(cart: dict[str, Any]) -> dict[str, int]:
    return {line["sku"]: line["quantity"] for line in cart["items"]}


async def _fill_cart(session: AsyncSession, user: User, lines: int) -> None:
    cart = Cart(user_id=user.id)
    session.add(cart)
    await session.flush()
    for _ in range(lines):
        variant = await make_variant(session, stock=10)
        session.add_all(
            ProductTranslation(
                product_id=variant.product_id,
                locale=locale,
                name="Filler",
                short_description="",
                description="",
            )
            for locale in Locale
        )
        session.add(CartItem(cart_id=cart.id, variant_id=variant.id, quantity=1))
    await session.flush()


async def _line_count(session: AsyncSession, user: User) -> int:
    statement = select(func.count()).select_from(CartItem).join(Cart).where(Cart.user_id == user.id)
    return await session.scalar(statement) or 0


async def test_cart_requires_a_session(raw_client: AsyncClient) -> None:
    assert (await raw_client.get(CART)).status_code == 401


async def test_cart_writes_require_the_csrf_header(raw_client: AsyncClient) -> None:
    raw_client.cookies.set(ACCESS_COOKIE, "anything")

    responses = [
        await raw_client.put(f"{CART}/items/1", json={"quantity": 1}),
        await raw_client.delete(f"{CART}/items/1"),
        await raw_client.post(f"{CART}/merge", json={"items": []}),
    ]

    assert [response.json()["code"] for response in responses] == ["csrf_failed"] * 3


@pytest.mark.usefixtures("user")
async def test_empty_cart(client: AsyncClient) -> None:
    response = await client.get(CART)

    assert response.status_code == 200
    assert response.json() == {
        "items": [],
        "item_count": 0,
        "subtotal": {"amount": "0", "currency": "ARS"},
        "has_issues": False,
        "currency": "ARS",
    }


@pytest.mark.usefixtures("user")
async def test_put_creates_and_sets_the_line(client: AsyncClient, session: AsyncSession) -> None:
    plugs = await _variant_id(session, "TRU-WP-6")

    assert (await _put(client, plugs, 3)).status_code == 200
    cart = (await _put(client, plugs, 5)).json()

    assert cart["items"] == [
        {
            "variant_id": plugs,
            "sku": "TRU-WP-6",
            "product_slug": "truper-nylon-wall-plugs-100",
            "product_name": "Tarugos de nylon (100 u.)",
            "variant_label": "6 mm",
            "image": None,
            "quantity": 5,
            "unit_price": {"amount": "3.50", "currency": "USD"},
            "line_total": {"amount": "17.50", "currency": "USD"},
            "stock_status": "in_stock",
            "issue": None,
            "available": None,
        }
    ]
    assert (cart["item_count"], cart["subtotal"], cart["has_issues"]) == (
        5,
        {"amount": "17.50", "currency": "USD"},
        False,
    )


@pytest.mark.usefixtures("user")
async def test_cart_uses_the_requested_currency_and_locale(
    client: AsyncClient, session: AsyncSession
) -> None:
    await _put(client, await _variant_id(session, "TRU-WP-6"), 2)
    await _put(client, await _variant_id(session, "STA-SD6"), 1)

    cart = (await client.get(CART, params={"currency": "ARS", "locale": "en"})).json()

    assert [
        (line["product_name"], line["variant_label"], line["unit_price"]["amount"], line["line_total"])
        for line in cart["items"]
    ] == [
        ("Nylon wall plugs (100 pcs)", "6 mm", "5075", {"amount": "10150", "currency": "ARS"}),
        ("6-piece screwdriver set", None, "28855", {"amount": "28855", "currency": "ARS"}),
    ]
    assert (cart["subtotal"], cart["item_count"]) == ({"amount": "39005", "currency": "ARS"}, 3)


@pytest.mark.usefixtures("user")
async def test_put_above_the_stock_conflicts(client: AsyncClient, session: AsyncSession) -> None:
    drill = await _variant_id(session, "BOS-HD18-18V")
    await _put(client, drill, 10)

    response = await _put(client, drill, 16)

    assert response.status_code == 409
    assert response.json()["code"] == "insufficient_stock"
    assert response.json()["details"] == {"available": 15}
    assert _quantities((await client.get(CART, params=USD)).json()) == {"BOS-HD18-18V": 10}


@pytest.mark.usefixtures("user")
async def test_put_unknown_variant_is_not_found(client: AsyncClient) -> None:
    response = await _put(client, 999999, 1)

    assert response.status_code == 404
    assert response.json()["code"] == "not_found"


@pytest.mark.usefixtures("user")
@pytest.mark.parametrize(("variant_id", "quantity"), [(1, 0), (1, 100), (0, 1)])
async def test_put_validates_the_request(client: AsyncClient, variant_id: int, quantity: int) -> None:
    assert (await _put(client, variant_id, quantity)).status_code == 422


async def test_put_rejects_a_new_line_over_the_limit(
    client: AsyncClient, session: AsyncSession, user: User
) -> None:
    await _fill_cart(session, user, 50)

    response = await _put(client, await _variant_id(session, "TRU-WP-6"), 1)

    assert response.status_code == 422
    assert response.json()["code"] == "cart_limit"
    assert await _line_count(session, user) == 50


@pytest.mark.usefixtures("user")
@pytest.mark.parametrize(
    "deactivate",
    [
        update(ProductVariant).where(ProductVariant.sku == "TRU-WP-6"),
        update(Product).where(Product.slug == "truper-nylon-wall-plugs-100"),
        update(Category).where(Category.slug == "fasteners"),
        update(Brand).where(Brand.slug == "truper"),
    ],
    ids=["variant", "product", "category", "brand"],
)
async def test_inactive_lines_are_unavailable(
    client: AsyncClient, session: AsyncSession, deactivate: Any
) -> None:
    plugs = await _variant_id(session, "TRU-WP-6")
    await _put(client, plugs, 2)
    await _put(client, await _variant_id(session, "STA-SD6"), 1)
    await session.execute(deactivate.values(is_active=False))

    cart = (await client.get(CART, params=USD)).json()

    assert [(line["sku"], line["issue"]) for line in cart["items"]] == [
        ("TRU-WP-6", "unavailable"),
        ("STA-SD6", None),
    ]
    assert (cart["subtotal"]["amount"], cart["item_count"], cart["has_issues"]) == ("19.90", 3, True)
    assert (await _put(client, plugs, 1)).status_code == 404


@pytest.mark.usefixtures("user")
async def test_stock_changes_show_up_as_line_issues(client: AsyncClient, session: AsyncSession) -> None:
    await _put(client, await _variant_id(session, "BOS-HD18-18V"), 10)
    await _put(client, await _variant_id(session, "STA-TM-5M"), 2)
    stock = {"BOS-HD18-18V": 4, "STA-TM-5M": 0}
    for sku, value in stock.items():
        await session.execute(update(ProductVariant).where(ProductVariant.sku == sku).values(stock=value))

    lines = (await client.get(CART, params=USD)).json()["items"]

    assert [(line["issue"], line["available"], line["stock_status"]) for line in lines] == [
        ("insufficient_stock", 4, "low_stock"),
        ("out_of_stock", None, "out_of_stock"),
    ]


@pytest.mark.usefixtures("user")
async def test_delete_removes_the_line(client: AsyncClient, session: AsyncSession) -> None:
    plugs = await _variant_id(session, "TRU-WP-6")
    await _put(client, plugs, 2)
    await _put(client, await _variant_id(session, "STA-SD6"), 1)

    first = await client.delete(f"{CART}/items/{plugs}")
    again = await client.delete(f"{CART}/items/{plugs}")

    assert first.status_code == again.status_code == 204
    assert _quantities((await client.get(CART, params=USD)).json()) == {"STA-SD6": 1}


@pytest.mark.usefixtures("user")
async def test_delete_without_a_cart_is_a_no_op(client: AsyncClient) -> None:
    assert (await client.delete(f"{CART}/items/1")).status_code == 204


async def test_carts_are_per_user(client: AsyncClient, session: AsyncSession, user: User) -> None:
    other = await make_user(session)
    session.add(Cart(user_id=other.id))
    await session.flush()

    await _put(client, await _variant_id(session, "TRU-WP-6"), 1)

    assert await _line_count(session, user) == 1
    assert await _line_count(session, other) == 0


@pytest.mark.usefixtures("user")
async def test_merge_keeps_the_largest_quantity(client: AsyncClient, session: AsyncSession) -> None:
    six, eight, screwdrivers = [
        await _variant_id(session, sku) for sku in ("TRU-WP-6", "TRU-WP-8", "STA-SD6")
    ]
    await _put(client, six, 5)
    await _put(client, eight, 2)
    guest = [(six, 3), (eight, 4), (screwdrivers, 1), (six, 1)]

    first = await _merge(client, guest)
    second = await _merge(client, guest)

    expected = {"TRU-WP-6": 5, "TRU-WP-8": 4, "STA-SD6": 1}
    assert _quantities(first["cart"]) == _quantities(second["cart"]) == expected
    assert first["adjustments"] == second["adjustments"] == []


@pytest.mark.usefixtures("user")
async def test_merge_reports_adjustments(client: AsyncClient, session: AsyncSession) -> None:
    drill, tape, plugs = [
        await _variant_id(session, sku) for sku in ("BOS-HD18-18V", "STA-TM-5M", "TRU-WP-6")
    ]
    await session.execute(update(ProductVariant).where(ProductVariant.id == tape).values(stock=0))
    await session.execute(
        update(ProductVariant).where(ProductVariant.id == plugs).values(is_active=False)
    )

    merged = await _merge(client, [(drill, 20), (tape, 3), (plugs, 2), (999999, 1)])

    assert _quantities(merged["cart"]) == {"BOS-HD18-18V": 15}
    assert merged["adjustments"] == [
        {"variant_id": drill, "requested": 20, "applied": 15, "reason": "insufficient_stock"},
        {"variant_id": tape, "requested": 3, "applied": 0, "reason": "insufficient_stock"},
        {"variant_id": plugs, "requested": 2, "applied": 0, "reason": "unavailable"},
        {"variant_id": 999999, "requested": 1, "applied": 0, "reason": "unavailable"},
    ]


async def test_merge_stops_at_the_line_limit(
    client: AsyncClient, session: AsyncSession, user: User
) -> None:
    await _fill_cart(session, user, 49)
    six, eight = [await _variant_id(session, sku) for sku in ("TRU-WP-6", "TRU-WP-8")]

    merged = await _merge(client, [(six, 1), (eight, 2)])

    assert len(merged["cart"]["items"]) == 50
    assert merged["adjustments"] == [
        {"variant_id": eight, "requested": 2, "applied": 0, "reason": "cart_limit"}
    ]


@pytest.mark.usefixtures("user")
async def test_merge_validates_the_request(client: AsyncClient) -> None:
    too_many = {"items": [{"variant_id": n, "quantity": 1} for n in range(1, 52)]}
    over_limit = {"items": [{"variant_id": 1, "quantity": 100}]}

    for body in (too_many, over_limit, {}):
        assert (await client.post(f"{CART}/merge", json=body)).status_code == 422


QUOTE = "/api/v1/cart/quote"


async def _quote(client: AsyncClient, items: list[tuple[int, int]], **params: str) -> Response:
    body = {"items": [{"variant_id": v, "quantity": q} for v, q in items]}
    return await client.post(QUOTE, json=body, params=params or USD)


@pytest.mark.usefixtures("user")
async def test_guest_quote_matches_the_customer_cart(
    client: AsyncClient, raw_client: AsyncClient, session: AsyncSession
) -> None:
    plugs, screwdrivers = [await _variant_id(session, sku) for sku in ("TRU-WP-6", "STA-SD6")]
    await _put(client, plugs, 2)
    await _put(client, screwdrivers, 1)
    customer = (await client.get(CART, params={"currency": "ARS", "locale": "en"})).json()

    items = [(plugs, 2), (screwdrivers, 1)]
    response = await _quote(raw_client, items, currency="ARS", locale="en")

    assert response.status_code == 200
    assert response.json() == customer


async def test_guest_quote_keeps_the_order_and_skips_unknown_variants(
    raw_client: AsyncClient, session: AsyncSession
) -> None:
    plugs, screwdrivers = [await _variant_id(session, sku) for sku in ("TRU-WP-6", "STA-SD6")]

    cart = (await _quote(raw_client, [(screwdrivers, 1), (999999, 1), (plugs, 2)])).json()

    assert [line["sku"] for line in cart["items"]] == ["STA-SD6", "TRU-WP-6"]
    assert (cart["item_count"], cart["subtotal"]) == (3, {"amount": "26.90", "currency": "USD"})


async def test_guest_quote_reports_line_issues(
    raw_client: AsyncClient, session: AsyncSession
) -> None:
    plugs, drill = [await _variant_id(session, sku) for sku in ("TRU-WP-6", "BOS-HD18-18V")]
    variants = update(ProductVariant)
    await session.execute(variants.where(ProductVariant.id == plugs).values(is_active=False))
    await session.execute(variants.where(ProductVariant.id == drill).values(stock=4))

    cart = (await _quote(raw_client, [(plugs, 1), (drill, 10)])).json()

    assert [(line["issue"], line["available"]) for line in cart["items"]] == [
        ("unavailable", None),
        ("insufficient_stock", 4),
    ]
    assert (cart["has_issues"], cart["subtotal"]["amount"]) == (True, "0.00")


@pytest.mark.parametrize(
    "items",
    [
        [],
        [{"variant_id": n, "quantity": 1} for n in range(1, 52)],
        [{"variant_id": 1, "quantity": 1}, {"variant_id": 1, "quantity": 2}],
        [{"variant_id": 1, "quantity": 100}],
        [{"variant_id": 0, "quantity": 1}],
        [{"variant_id": 1, "quantity": 1, "price": "1.00"}],
    ],
    ids=["empty", "over-limit", "duplicate", "quantity", "variant", "extra-field"],
)
async def test_guest_quote_validates_the_request(
    raw_client: AsyncClient, items: list[dict[str, Any]]
) -> None:
    response = await raw_client.post(QUOTE, json={"items": items})

    assert (response.status_code, response.json()["code"]) == (422, "validation_error")
