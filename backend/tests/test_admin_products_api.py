from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditLog, User
from tests.conftest import RevalidationLog

ADMIN = "/api/v1/admin"
PRODUCTS = f"{ADMIN}/products"
USD = {"currency": "USD"}
LABEL = {"es": "Prueba", "en": "Test"}
TEXTS = {
    "es": {
        "name": "Taladro de prueba",
        "short_description": "Corto",
        "description": "Largo",
        "specs": {"Garantía": "12 meses"},
    },
    "en": {"name": "Test drill", "short_description": "Short", "description": "Long"},
}


async def audit_rows(session: AsyncSession, entity: str) -> list[AuditLog]:
    statement = select(AuditLog).where(AuditLog.entity == entity).order_by(AuditLog.id)
    return list((await session.scalars(statement)).all())


async def post(client: AsyncClient, path: str, **body: Any) -> dict[str, Any]:
    response = await client.post(f"{ADMIN}{path}", json=body)
    assert response.status_code == 201, response.json()
    return response.json()


async def category_id(client: AsyncClient, slug: str = "raiz", **body: Any) -> int:
    return (await post(client, "/categories", slug=slug, name=LABEL, **body))["id"]


async def product(client: AsyncClient, slug: str = "taladro", **body: Any) -> dict[str, Any]:
    body.setdefault("category_id", await category_id(client, f"cat-{slug}"))
    return await post(client, "/products", slug=slug, translations=TEXTS, **body)


async def variant(client: AsyncClient, product_id: int, **body: Any) -> dict[str, Any]:
    fields = {"sku": "SKU-1", "price_usd": "100.00", "stock": 10} | body
    return await post(client, f"/products/{product_id}/variants", **fields)


async def test_create_returns_the_whole_product(
    client: AsyncClient, session: AsyncSession, admin: User, revalidations: RevalidationLog
) -> None:
    created = await product(client, "Taladro-Nuevo")

    assert created["slug"] == "taladro-nuevo"
    assert created["translations"]["es"]["name"] == "Taladro de prueba"
    assert created["translations"]["en"]["specs"] is None
    assert created["variants"] == []
    assert (created["is_active"], created["is_featured"]) == (True, False)

    [log] = await audit_rows(session, "product")
    assert log.changes is not None
    assert log.changes["slug"] == {"before": None, "after": "taladro-nuevo"}
    assert log.changes["en.name"] == {"before": None, "after": "Test drill"}
    assert ["catalog"] in revalidations.tags


@pytest.mark.parametrize("missing", ["es", "en"])
async def test_both_languages_are_required(
    client: AsyncClient, admin: User, missing: str
) -> None:
    texts = {locale: text for locale, text in TEXTS.items() if locale != missing}

    response = await client.post(
        PRODUCTS,
        json={"slug": "a", "category_id": await category_id(client), "translations": texts},
    )

    assert response.status_code == 422


async def test_a_duplicate_slug_conflicts(client: AsyncClient, admin: User) -> None:
    created = await product(client, "repetido")

    response = await client.post(
        PRODUCTS,
        json={"slug": "repetido", "category_id": created["category_id"], "translations": TEXTS},
    )

    assert response.status_code == 409
    assert response.json()["code"] == "slug_taken"


async def test_the_category_must_exist_and_be_active(client: AsyncClient, admin: User) -> None:
    inactive = await category_id(client, "inactiva", is_active=False)

    for missing in (inactive, 999999):
        response = await client.post(
            PRODUCTS, json={"slug": "a", "category_id": missing, "translations": TEXTS}
        )
        assert response.status_code == 422
        assert response.json()["code"] == "unknown_category"


async def test_the_brand_must_exist_and_be_active(client: AsyncClient, admin: User) -> None:
    brand = await post(client, "/brands", slug="apagada", name="Apagada", is_active=False)
    category = await category_id(client)

    for missing in (brand["id"], 999999):
        response = await client.post(
            PRODUCTS,
            json={
                "slug": "a",
                "category_id": category,
                "brand_id": missing,
                "translations": TEXTS,
            },
        )
        assert response.status_code == 422
        assert response.json()["code"] == "unknown_brand"


async def test_a_product_keeps_a_category_that_was_deactivated_later(
    client: AsyncClient, admin: User
) -> None:
    created = await product(client)
    await client.patch(
        f"{ADMIN}/categories/{created['category_id']}", json={"is_active": False}
    )

    response = await client.patch(f"{PRODUCTS}/{created['id']}", json={"is_featured": True})

    assert response.status_code == 200


async def test_text_changes_are_audited_field_by_field(
    client: AsyncClient, session: AsyncSession, admin: User
) -> None:
    created = await product(client)
    texts = {
        "es": TEXTS["es"] | {"name": "Otro nombre"},
        "en": TEXTS["en"],
    }

    response = await client.patch(
        f"{PRODUCTS}/{created['id']}", json={"translations": texts, "brand_id": None}
    )

    assert response.status_code == 200
    assert response.json()["translations"]["es"]["name"] == "Otro nombre"
    update = (await audit_rows(session, "product"))[-1]
    assert update.action == "update"
    assert update.changes == {
        "es.name": {"before": "Taladro de prueba", "after": "Otro nombre"},
    }


async def test_a_product_with_a_variant_reaches_the_public_api(
    client: AsyncClient, admin: User
) -> None:
    created = await product(client)
    public = f"/api/v1/products/{created['slug']}"
    assert (await client.get(public, params=USD)).status_code == 404

    await variant(client, created["id"])

    body = (await client.get(public, params=USD | {"locale": "en"})).json()
    assert body["name"] == "Test drill"
    assert body["price_from"]["amount"] == "100.00"


async def test_a_price_change_is_public_at_once(client: AsyncClient, admin: User) -> None:
    created = await product(client)
    item = await variant(client, created["id"])
    public = f"/api/v1/products/{created['slug']}"
    assert (await client.get(public, params=USD)).json()["price_from"]["amount"] == "100.00"

    await client.patch(
        f"{ADMIN}/variants/{item['id']}", json={"version": item["version"], "price_usd": "90.00"}
    )

    assert (await client.get(public, params=USD)).json()["price_from"]["amount"] == "90.00"


async def test_archiving_hides_the_product_and_can_be_undone(
    client: AsyncClient, session: AsyncSession, admin: User
) -> None:
    created = await product(client)
    await variant(client, created["id"])
    public = f"/api/v1/products/{created['slug']}"
    assert (await client.get(public, params=USD)).status_code == 200

    archived = await client.post(f"{PRODUCTS}/{created['id']}/archive")
    assert archived.status_code == 200
    assert archived.json()["is_active"] is False
    assert (await client.get(public, params=USD)).status_code == 404

    again = await client.post(f"{PRODUCTS}/{created['id']}/archive")
    assert again.status_code == 200
    assert [log.action for log in await audit_rows(session, "product")] == ["create", "archive"]

    await client.patch(f"{PRODUCTS}/{created['id']}", json={"is_active": True})
    assert (await client.get(public, params=USD)).status_code == 200


async def test_products_have_no_delete(client: AsyncClient, admin: User) -> None:
    created = await product(client)

    assert (await client.delete(f"{PRODUCTS}/{created['id']}")).status_code == 405


async def test_the_listing_filters(client: AsyncClient, admin: User) -> None:
    first = await product(client, "uno")
    second = await product(client, "dos")
    await variant(client, first["id"], sku="ABC-100", price_usd="50.00", stock=3)
    await variant(client, first["id"], sku="ABC-200", price_usd="40.00", stock=4)
    await client.post(f"{PRODUCTS}/{second['id']}/archive")

    body = (await client.get(PRODUCTS)).json()
    assert [item["slug"] for item in body["items"]] == ["dos", "uno"]
    row = body["items"][1]
    assert (row["name"], row["variant_count"], row["stock"]) == ("Taladro de prueba", 2, 7)
    assert row["price_from_usd"] == "40.00"

    english = (await client.get(PRODUCTS, params={"locale": "en"})).json()
    assert english["items"][0]["name"] == "Test drill"

    async def slugs(**params: Any) -> list[str]:
        items = (await client.get(PRODUCTS, params=params)).json()["items"]
        return [item["slug"] for item in items]

    assert await slugs(is_active=False) == ["dos"]
    assert await slugs(is_active=True) == ["uno"]
    assert await slugs(q="abc-1") == ["uno"]
    assert await slugs(q="Test dr") == ["dos", "uno"]
    assert await slugs(q="un") == ["uno"]
    assert await slugs(q="%%") == []
    assert await slugs(category_id=second["category_id"]) == ["dos"]


async def test_variant_create_and_audit(
    client: AsyncClient, session: AsyncSession, admin: User
) -> None:
    created = await product(client)

    item = await variant(client, created["id"], compare_at_price_usd="120.00")

    assert (item["version"], item["stock"], item["attribute_value_ids"]) == (1, 10, [])
    [log] = await audit_rows(session, "product_variant")
    assert log.action == "create"
    assert log.changes is not None
    assert log.changes["sku"] == {"before": None, "after": "SKU-1"}


async def test_a_variant_needs_an_existing_product(client: AsyncClient, admin: User) -> None:
    response = await client.post(
        f"{PRODUCTS}/999999/variants", json={"sku": "A", "price_usd": "1.00"}
    )

    assert response.status_code == 404


async def test_a_duplicate_sku_conflicts(client: AsyncClient, admin: User) -> None:
    created = await product(client)
    await variant(client, created["id"])

    response = await client.post(
        f"{PRODUCTS}/{created['id']}/variants", json={"sku": "SKU-1", "price_usd": "1.00"}
    )

    assert response.status_code == 409
    assert response.json()["code"] == "sku_taken"


async def test_the_previous_price_must_be_above_the_price(
    client: AsyncClient, admin: User
) -> None:
    created = await product(client)
    item = await variant(client, created["id"], compare_at_price_usd="120.00")

    response = await client.patch(
        f"{ADMIN}/variants/{item['id']}", json={"version": 1, "price_usd": "120.00"}
    )

    assert response.status_code == 422
    assert response.json()["code"] == "invalid_compare_at"

    cleared = await client.patch(
        f"{ADMIN}/variants/{item['id']}",
        json={"version": 1, "price_usd": "130.00", "compare_at_price_usd": None},
    )
    assert cleared.status_code == 200


async def test_two_edits_with_the_same_version_one_wins(
    client: AsyncClient, session: AsyncSession, admin: User
) -> None:
    created = await product(client)
    item = await variant(client, created["id"])
    url = f"{ADMIN}/variants/{item['id']}"

    first = await client.patch(url, json={"version": 1, "price_usd": "90.00"})
    second = await client.patch(url, json={"version": 1, "price_usd": "80.00"})

    assert first.status_code == 200
    assert first.json()["version"] == 2
    assert second.status_code == 409
    body = second.json()
    assert body["code"] == "version_conflict"
    assert (body["details"]["version"], body["details"]["price_usd"]) == (2, "90.00")
    assert len(await audit_rows(session, "product_variant")) == 2


async def test_a_patch_needs_the_version(client: AsyncClient, admin: User) -> None:
    created = await product(client)
    item = await variant(client, created["id"])

    response = await client.patch(f"{ADMIN}/variants/{item['id']}", json={"price_usd": "1.00"})

    assert response.status_code == 422


async def test_stock_never_travels_in_a_patch(client: AsyncClient, admin: User) -> None:
    created = await product(client)
    item = await variant(client, created["id"])

    response = await client.patch(
        f"{ADMIN}/variants/{item['id']}", json={"version": 1, "stock": 99}
    )

    assert response.status_code == 422


async def attribute_values(client: AsyncClient, code: str, *slugs: str) -> list[int]:
    attribute = await post(client, "/attributes", code=code, name=LABEL)
    values = [
        await post(client, f"/attributes/{attribute['id']}/values", slug=slug, value=LABEL)
        for slug in slugs
    ]
    return [value["id"] for value in values]


async def test_attribute_values_are_replaced_as_a_whole(
    client: AsyncClient, session: AsyncSession, admin: User
) -> None:
    created = await product(client)
    small, large = await attribute_values(client, "medida", "s", "l")
    [red] = await attribute_values(client, "color", "rojo")
    item = await variant(client, created["id"], attribute_value_ids=[small, red])
    assert item["attribute_value_ids"] == sorted([small, red])

    response = await client.patch(
        f"{ADMIN}/variants/{item['id']}", json={"version": 1, "attribute_value_ids": [large]}
    )

    assert response.status_code == 200
    assert response.json()["attribute_value_ids"] == [large]
    assert response.json()["version"] == 2
    update = (await audit_rows(session, "product_variant"))[-1]
    assert update.changes == {
        "attribute_value_ids": {"before": sorted([small, red]), "after": [large]}
    }


async def test_a_variant_has_one_value_per_attribute(client: AsyncClient, admin: User) -> None:
    created = await product(client)
    small, large = await attribute_values(client, "medida", "s", "l")

    response = await client.post(
        f"{PRODUCTS}/{created['id']}/variants",
        json={"sku": "A", "price_usd": "1.00", "attribute_value_ids": [small, large]},
    )

    assert response.status_code == 422
    assert response.json()["code"] == "duplicate_attribute"


async def test_attribute_values_must_exist(client: AsyncClient, admin: User) -> None:
    created = await product(client)

    response = await client.post(
        f"{PRODUCTS}/{created['id']}/variants",
        json={"sku": "A", "price_usd": "1.00", "attribute_value_ids": [999999]},
    )

    assert response.status_code == 422
    assert response.json()["code"] == "unknown_attribute_value"


async def test_archiving_a_variant_hides_it(
    client: AsyncClient, session: AsyncSession, admin: User
) -> None:
    created = await product(client)
    kept = await variant(client, created["id"], sku="QUEDA")
    item = await variant(client, created["id"], sku="SE-VA")

    response = await client.post(f"{ADMIN}/variants/{item['id']}/archive")

    assert response.status_code == 200
    assert response.json()["is_active"] is False
    body = (await client.get(f"/api/v1/products/{created['slug']}", params=USD)).json()
    assert [row["id"] for row in body["variants"]] == [kept["id"]]
    assert (await audit_rows(session, "product_variant"))[-1].action == "archive"
    assert (await client.delete(f"{ADMIN}/variants/{item['id']}")).status_code == 405


async def test_stock_adjustments_are_audited_with_their_reason(
    client: AsyncClient, session: AsyncSession, admin: User, revalidations: RevalidationLog
) -> None:
    created = await product(client)
    item = await variant(client, created["id"])
    revalidations.tags.clear()

    response = await client.post(
        f"{ADMIN}/variants/{item['id']}/stock", json={"delta": -4, "reason": "  Rotura  "}
    )

    assert response.status_code == 200
    assert (response.json()["stock"], response.json()["version"]) == (6, 2)
    log = (await audit_rows(session, "product_variant"))[-1]
    assert log.action == "stock_adjust"
    assert log.changes == {
        "reason": {"before": None, "after": "Rotura"},
        "stock": {"before": 10, "after": 6},
    }
    assert revalidations.tags == [["catalog"]]


async def test_stock_never_goes_below_zero(
    client: AsyncClient, session: AsyncSession, admin: User
) -> None:
    created = await product(client)
    item = await variant(client, created["id"], stock=3)
    url = f"{ADMIN}/variants/{item['id']}/stock"

    response = await client.post(url, json={"delta": -4, "reason": "Rotura"})

    assert response.status_code == 409
    assert response.json()["code"] == "insufficient_stock"
    assert response.json()["details"] == {"stock": 3}
    assert len(await audit_rows(session, "product_variant")) == 1

    emptied = await client.post(url, json={"delta": -3, "reason": "Rotura"})
    assert emptied.json()["stock"] == 0


@pytest.mark.parametrize(
    "body",
    [
        {"delta": 0, "reason": "Nada"},
        {"delta": 1},
        {"delta": 1, "reason": "   "},
        {"delta": 1_000_001, "reason": "Mucho"},
    ],
)
async def test_invalid_stock_adjustments(
    client: AsyncClient, admin: User, body: dict[str, Any]
) -> None:
    created = await product(client)
    item = await variant(client, created["id"])

    response = await client.post(f"{ADMIN}/variants/{item['id']}/stock", json=body)

    assert response.status_code == 422


async def test_missing_variant_answers_404(client: AsyncClient, admin: User) -> None:
    url = f"{ADMIN}/variants/999999"

    assert (await client.patch(url, json={"version": 1})).status_code == 404
    assert (await client.post(f"{url}/archive")).status_code == 404
    assert (await client.post(f"{url}/stock", json={"delta": 1, "reason": "A"})).status_code == 404
