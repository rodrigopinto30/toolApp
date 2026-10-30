from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditLog, Category, Product, User
from tests.conftest import RevalidationLog
from tests.factories import make_variant

ADMIN = "/api/v1/admin"
LABEL = {"es": "Prueba", "en": "Test"}


async def audit_rows(session: AsyncSession, entity: str) -> list[AuditLog]:
    statement = select(AuditLog).where(AuditLog.entity == entity).order_by(AuditLog.id)
    return list((await session.scalars(statement)).all())


async def create(client: AsyncClient, path: str, **body: Any) -> dict[str, Any]:
    response = await client.post(f"{ADMIN}{path}", json=body)
    assert response.status_code == 201, response.json()
    return response.json()


async def category(client: AsyncClient, slug: str, **body: Any) -> dict[str, Any]:
    return await create(client, "/categories", slug=slug, name=LABEL, **body)


async def test_category_crud_is_audited_and_published(
    client: AsyncClient, session: AsyncSession, admin: User, revalidations: RevalidationLog
) -> None:
    created = await category(client, "Herramientas-Nuevas", description=LABEL, position=2)
    assert created["slug"] == "herramientas-nuevas"
    assert (created["parent_id"], created["position"]) == (None, 2)

    url = f"{ADMIN}/categories/{created['id']}"
    updated = await client.patch(url, json={"description": None, "position": 5})
    assert updated.status_code == 200
    assert updated.json()["description"] is None

    assert (await client.delete(url)).status_code == 204
    assert (await client.get(url)).status_code == 404

    actions = [log.action for log in await audit_rows(session, "category")]
    assert actions == ["create", "update", "delete"]
    assert revalidations.tags == [["catalog"]] * 3


async def test_a_new_category_reaches_the_public_tree(client: AsyncClient, admin: User) -> None:
    await client.get("/api/v1/categories")

    await category(client, "visible-al-instante")

    tree = (await client.get("/api/v1/categories")).json()
    assert "visible-al-instante" in [node["slug"] for node in tree]


async def test_a_duplicate_slug_conflicts(client: AsyncClient, admin: User) -> None:
    await category(client, "repetida")

    response = await client.post(f"{ADMIN}/categories", json={"slug": "repetida", "name": LABEL})

    assert response.status_code == 409
    assert response.json()["code"] == "slug_taken"


@pytest.mark.parametrize("slug", ["con espacio", "-inicio", "fin-", "doble--guion", ""])
async def test_invalid_slugs_are_rejected(client: AsyncClient, admin: User, slug: str) -> None:
    response = await client.post(f"{ADMIN}/categories", json={"slug": slug, "name": LABEL})

    assert response.status_code == 422


async def test_the_tree_has_three_levels(client: AsyncClient, admin: User) -> None:
    first = await category(client, "nivel-1")
    second = await category(client, "nivel-2", parent_id=first["id"])
    third = await category(client, "nivel-3", parent_id=second["id"])

    response = await client.post(
        f"{ADMIN}/categories", json={"slug": "nivel-4", "name": LABEL, "parent_id": third["id"]}
    )

    assert response.status_code == 422
    assert response.json()["code"] == "category_too_deep"


async def test_moving_a_subtree_counts_its_height(client: AsyncClient, admin: User) -> None:
    root = await category(client, "raiz")
    middle = await category(client, "medio", parent_id=root["id"])
    other = await category(client, "otra")
    await category(client, "hoja", parent_id=middle["id"])

    response = await client.patch(
        f"{ADMIN}/categories/{middle['id']}", json={"parent_id": other["id"]}
    )
    assert response.status_code == 200

    deep = await client.patch(f"{ADMIN}/categories/{root['id']}", json={"parent_id": other["id"]})
    assert deep.status_code == 200

    too_deep = await client.patch(
        f"{ADMIN}/categories/{other['id']}", json={"parent_id": root["id"]}
    )
    assert too_deep.status_code == 422


async def test_a_category_cannot_move_under_itself(client: AsyncClient, admin: User) -> None:
    root = await category(client, "raiz")
    child = await category(client, "hija", parent_id=root["id"])

    response = await client.patch(
        f"{ADMIN}/categories/{root['id']}", json={"parent_id": child["id"]}
    )

    assert response.status_code == 422
    assert response.json()["code"] == "category_cycle"


async def test_a_category_with_children_is_not_deleted_nor_orphaned(
    client: AsyncClient, session: AsyncSession, admin: User
) -> None:
    root = await category(client, "raiz")
    child = await category(client, "hija", parent_id=root["id"])

    response = await client.delete(f"{ADMIN}/categories/{root['id']}")

    assert response.status_code == 409
    assert response.json()["code"] == "in_use"
    parent_id = await session.scalar(select(Category.parent_id).where(Category.id == child["id"]))
    assert parent_id == root["id"]


async def test_a_category_with_products_cannot_be_deleted(
    client: AsyncClient, session: AsyncSession, admin: User
) -> None:
    variant = await make_variant(session)
    product = await session.get(Product, variant.product_id)
    assert product is not None

    response = await client.delete(f"{ADMIN}/categories/{product.category_id}")

    assert response.status_code == 409
    assert response.json()["code"] == "in_use"


async def test_a_parent_needs_its_children_deactivated_first(
    client: AsyncClient, admin: User
) -> None:
    root = await category(client, "raiz")
    child = await category(client, "hija", parent_id=root["id"])

    blocked = await client.patch(f"{ADMIN}/categories/{root['id']}", json={"is_active": False})
    assert blocked.status_code == 409
    assert blocked.json()["code"] == "active_children"

    await client.patch(f"{ADMIN}/categories/{child['id']}", json={"is_active": False})
    allowed = await client.patch(f"{ADMIN}/categories/{root['id']}", json={"is_active": False})
    assert allowed.status_code == 200


async def test_an_active_category_needs_an_active_parent(
    client: AsyncClient, admin: User
) -> None:
    root = await category(client, "raiz", is_active=False)

    response = await client.post(
        f"{ADMIN}/categories", json={"slug": "hija", "name": LABEL, "parent_id": root["id"]}
    )
    assert response.status_code == 422
    assert response.json()["code"] == "inactive_parent"

    child = await category(client, "hija", parent_id=root["id"], is_active=False)
    revived = await client.patch(f"{ADMIN}/categories/{child['id']}", json={"is_active": True})
    assert revived.status_code == 422


async def test_brand_crud(
    client: AsyncClient, session: AsyncSession, admin: User, revalidations: RevalidationLog
) -> None:
    brand = await create(client, "/brands", slug="acme", name="ACME")
    url = f"{ADMIN}/brands/{brand['id']}"

    assert (await client.patch(url, json={"name": "Acme SA"})).json()["name"] == "Acme SA"
    assert (await client.delete(url)).status_code == 204

    create_row, update_row, delete_row = await audit_rows(session, "brand")
    assert update_row.changes == {"name": {"before": "ACME", "after": "Acme SA"}}
    assert (create_row.action, delete_row.action) == ("create", "delete")
    assert revalidations.tags == [["catalog"]] * 3


async def test_a_brand_with_products_cannot_be_deleted(
    client: AsyncClient, admin: User
) -> None:
    brand = await create(client, "/brands", slug="acme", name="ACME")
    root = await category(client, "raiz")
    await create(
        client,
        "/products",
        slug="producto",
        category_id=root["id"],
        brand_id=brand["id"],
        translations={
            locale: {"name": "A", "short_description": "B", "description": "C"}
            for locale in ("es", "en")
        },
    )

    response = await client.delete(f"{ADMIN}/brands/{brand['id']}")

    assert response.status_code == 409
    assert response.json()["code"] == "in_use"


async def test_attribute_with_its_values(
    client: AsyncClient, session: AsyncSession, admin: User, revalidations: RevalidationLog
) -> None:
    attribute = await create(client, "/attributes", code="Material_X", name=LABEL)
    assert (attribute["code"], attribute["values"]) == ("material_x", [])
    base = f"/attributes/{attribute['id']}/values"

    value = await create(client, base, slug="acero", value=LABEL, position=1)
    await create(client, base, slug="madera", value=LABEL)

    listed = (await client.get(f"{ADMIN}{base}")).json()
    assert [item["slug"] for item in listed["items"]] == ["madera", "acero"]
    read = (await client.get(f"{ADMIN}/attributes/{attribute['id']}")).json()
    assert len(read["values"]) == 2

    url = f"{ADMIN}{base}/{value['id']}"
    assert (await client.patch(url, json={"position": 9})).json()["position"] == 9
    assert (await client.delete(url)).status_code == 204
    assert (await client.get(url)).status_code == 404

    actions = [log.action for log in await audit_rows(session, "attribute_value")]
    assert actions == ["create", "create", "update", "delete"]


async def test_a_value_belongs_to_its_attribute(client: AsyncClient, admin: User) -> None:
    first = await create(client, "/attributes", code="uno", name=LABEL)
    second = await create(client, "/attributes", code="dos", name=LABEL)
    value = await create(client, f"/attributes/{first['id']}/values", slug="a", value=LABEL)

    url = f"{ADMIN}/attributes/{second['id']}/values/{value['id']}"

    assert (await client.get(url)).status_code == 404
    assert (await client.patch(url, json={"position": 1})).status_code == 404
    assert (await client.delete(url)).status_code == 404


async def test_a_duplicate_value_slug_conflicts_only_inside_its_attribute(
    client: AsyncClient, admin: User
) -> None:
    first = await create(client, "/attributes", code="uno", name=LABEL)
    second = await create(client, "/attributes", code="dos", name=LABEL)
    await create(client, f"/attributes/{first['id']}/values", slug="a", value=LABEL)

    await create(client, f"/attributes/{second['id']}/values", slug="a", value=LABEL)
    response = await client.post(
        f"{ADMIN}/attributes/{first['id']}/values", json={"slug": "a", "value": LABEL}
    )

    assert response.status_code == 409
    assert response.json()["code"] == "slug_taken"


async def test_a_value_needs_an_existing_attribute(client: AsyncClient, admin: User) -> None:
    response = await client.post(
        f"{ADMIN}/attributes/999999/values", json={"slug": "a", "value": LABEL}
    )

    assert response.status_code == 404


async def test_deleting_an_attribute_takes_its_unused_values(
    client: AsyncClient, session: AsyncSession, admin: User
) -> None:
    attribute = await create(client, "/attributes", code="uno", name=LABEL)
    await create(client, f"/attributes/{attribute['id']}/values", slug="a", value=LABEL)

    assert (await client.delete(f"{ADMIN}/attributes/{attribute['id']}")).status_code == 204

    [_, delete_row] = await audit_rows(session, "attribute")
    assert delete_row.changes is not None
    assert delete_row.changes["values"] == {"before": ["a"], "after": None}


async def test_a_value_used_by_a_variant_blocks_both_deletes(
    client: AsyncClient, session: AsyncSession, admin: User
) -> None:
    attribute = await create(client, "/attributes", code="uno", name=LABEL)
    value = await create(client, f"/attributes/{attribute['id']}/values", slug="a", value=LABEL)
    variant = await make_variant(session)
    await create(
        client,
        f"/products/{variant.product_id}/variants",
        sku="USA-VALOR",
        price_usd="10.00",
        attribute_value_ids=[value["id"]],
    )
    attribute_url = f"{ADMIN}/attributes/{attribute['id']}"

    for url in (f"{attribute_url}/values/{value['id']}", attribute_url):
        response = await client.delete(url)
        assert response.status_code == 409
        assert response.json()["code"] == "in_use"

    assert len((await client.get(attribute_url)).json()["values"]) == 1
