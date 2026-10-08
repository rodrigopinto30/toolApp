import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Category, Product, ProductVariant

pytestmark = pytest.mark.usefixtures("seeded")

DRILL = "bosch-cordless-hammer-drill-18v"


async def test_category_tree(client: AsyncClient) -> None:
    response = await client.get("/api/v1/categories", params={"locale": "en"})

    tree = response.json()
    assert [node["slug"] for node in tree][:2] == ["power-tools", "hand-tools"]
    assert tree[0]["name"] == "Power tools"
    assert [child["slug"] for child in tree[0]["children"]] == ["drills", "angle-grinders", "saws"]


async def test_inactive_category_is_hidden_with_its_products(
    client: AsyncClient, session: AsyncSession
) -> None:
    category = await session.scalar(select(Category).where(Category.slug == "garden"))
    category.is_active = False
    await session.flush()

    tree = (await client.get("/api/v1/categories")).json()
    products = (await client.get("/api/v1/products", params={"size": 48})).json()

    assert "garden" not in [node["slug"] for node in tree]
    assert products["total"] == 19


async def test_brands_and_attributes(client: AsyncClient) -> None:
    brands = (await client.get("/api/v1/brands")).json()
    attributes = (await client.get("/api/v1/attributes", params={"locale": "es"})).json()

    assert len(brands) == 8
    voltage = next(a for a in attributes if a["code"] == "voltage")
    assert voltage["name"] == "Voltaje"
    assert [v["slug"] for v in voltage["values"]] == ["12v", "18v", "20v"]


async def test_product_card_shape_in_ars(client: AsyncClient) -> None:
    response = await client.get("/api/v1/products", params={"category": "drills", "brand": "bosch"})

    card = response.json()["items"][0]
    assert card["slug"] == DRILL
    assert card["price_from"] == {"amount": "274050", "currency": "ARS"}
    assert card["compare_at"] == {"amount": "317550", "currency": "ARS"}
    assert card["brand"] == {"slug": "bosch", "name": "Bosch"}
    assert card["stock_status"] == "in_stock"
    assert "stock" not in card


async def test_featured(client: AsyncClient) -> None:
    response = await client.get("/api/v1/products/featured", params={"currency": "USD"})

    assert {card["slug"] for card in response.json()} == {
        DRILL,
        "dewalt-drill-driver-20v",
        "bosch-angle-grinder-115",
        "stanley-screwdriver-set-6",
        "stanley-tape-measure",
    }


async def test_product_detail(client: AsyncClient) -> None:
    response = await client.get(f"/api/v1/products/{DRILL}", params={"locale": "en", "currency": "USD"})

    detail = response.json()
    assert response.status_code == 200
    assert detail["name"] == "18V cordless hammer drill"
    assert [c["slug"] for c in detail["category_path"]] == ["power-tools", "drills"]
    assert detail["specs"] == {"Warranty": "12 months"}
    variant = detail["variants"][0]
    assert variant["sku"] == "BOS-HD18-18V"
    assert variant["price"] == {"amount": "189.00", "currency": "USD"}
    assert variant["attributes"] == [
        {"code": "voltage", "name": "Voltage", "value_slug": "18v", "value": "18V"}
    ]


async def test_detail_converts_variant_prices(client: AsyncClient) -> None:
    detail = (await client.get("/api/v1/products/stanley-adjustable-wrench")).json()

    assert [v["price"]["amount"] for v in detail["variants"]] == ["14355", "18705", "24505"]
    assert detail["price_from"] == {"amount": "14355", "currency": "ARS"}


async def test_unknown_product_is_404(client: AsyncClient) -> None:
    response = await client.get("/api/v1/products/no-such-slug")

    assert response.status_code == 404
    assert response.json()["code"] == "not_found"
    assert response.headers["Cache-Control"] == "no-store"


async def test_inactive_product_and_variants_are_hidden(
    client: AsyncClient, session: AsyncSession
) -> None:
    product = await session.scalar(select(Product).where(Product.slug == DRILL))
    product.is_active = False
    wrench = await session.scalar(select(ProductVariant).where(ProductVariant.sku == "STA-AW-150"))
    wrench.is_active = False
    await session.flush()

    assert (await client.get(f"/api/v1/products/{DRILL}")).status_code == 404
    detail = (await client.get("/api/v1/products/stanley-adjustable-wrench")).json()
    assert [v["sku"] for v in detail["variants"]] == ["STA-AW-200", "STA-AW-250"]


async def test_low_and_out_of_stock_status(client: AsyncClient, session: AsyncSession) -> None:
    variant = await session.scalar(select(ProductVariant).where(ProductVariant.sku == "BOS-LDM40"))
    variant.stock = 3
    await session.flush()
    low = (await client.get("/api/v1/products/bosch-laser-distance-meter-40m")).json()

    assert low["stock_status"] == "low_stock"


async def test_provinces_and_pickup_points(client: AsyncClient) -> None:
    provinces = (await client.get("/api/v1/provinces", params={"locale": "en"})).json()
    pickup = (await client.get("/api/v1/pickup-points")).json()

    assert len(provinces) == 24
    cordoba = next(p for p in provinces if p["code"] == "AR-X")
    assert cordoba["zone"]["name"] == "Center"
    assert pickup[0]["name"] == "ToolApp Store"


@pytest.mark.parametrize(
    "path",
    ["/api/v1/categories", "/api/v1/brands", "/api/v1/products", "/api/v1/provinces"],
)
async def test_public_endpoints_are_cacheable(client: AsyncClient, path: str) -> None:
    response = await client.get(path)

    assert response.headers["Cache-Control"] == "public, max-age=60"
