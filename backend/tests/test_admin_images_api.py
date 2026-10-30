import io
import os
from pathlib import Path
from typing import Any

import pytest
from httpx import AsyncClient, Response
from PIL import Image
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.media.paths import IMAGE_WIDTHS
from app.models import AuditLog, ProductImage, User
from app.services.admin.media import MAX_PRODUCT_IMAGES
from tests.conftest import RevalidationLog
from tests.images import encoded

ADMIN = "/api/v1/admin"
USD = {"currency": "USD"}
LABEL = {"es": "Prueba", "en": "Test"}
TEXT = {"name": "Taladro", "short_description": "Corto", "description": "Largo"}
MIB = 1024 * 1024


async def post(client: AsyncClient, path: str, **body: Any) -> dict[str, Any]:
    response = await client.post(f"{ADMIN}{path}", json=body)
    assert response.status_code == 201, response.json()
    return response.json()


async def product(client: AsyncClient, slug: str = "taladro") -> dict[str, Any]:
    category = await post(client, "/categories", slug=f"cat-{slug}", name=LABEL)
    return await post(
        client,
        "/products",
        slug=slug,
        category_id=category["id"],
        translations={"es": TEXT, "en": TEXT},
    )


async def upload(
    client: AsyncClient, path: str, data: bytes | None = None, name: str = "foto.jpg"
) -> Response:
    source = encoded((1600, 1200)) if data is None else data
    return await client.post(f"{ADMIN}{path}", files={"file": (name, source, "image/jpeg")})


def files_in(root: Path) -> list[str]:
    return sorted(file.name for file in root.rglob("*") if file.is_file())


async def audit_actions(session: AsyncSession, entity: str) -> list[str]:
    statement = select(AuditLog.action).where(AuditLog.entity == entity).order_by(AuditLog.id)
    return list((await session.scalars(statement)).all())


async def test_upload_stores_the_four_widths_and_a_row(
    client: AsyncClient,
    session: AsyncSession,
    admin: User,
    tmp_path: Path,
    revalidations: RevalidationLog,
) -> None:
    created = await product(client)
    revalidations.tags.clear()

    response = await upload(client, f"/products/{created['id']}/images")

    assert response.status_code == 201, response.json()
    body = response.json()
    assert body["url"].startswith(f"/media/products/{created['id']}/")
    assert body["url"].endswith("-1280.webp")
    assert (body["width"], body["height"], body["position"]) == (1280, 960, 0)
    assert revalidations.tags == [["catalog"]]

    relative = body["url"].removeprefix("/media/")
    for width in IMAGE_WIDTHS:
        assert (tmp_path / relative.replace("-1280.webp", f"-{width}.webp")).exists()
    with Image.open(tmp_path / relative) as stored:
        assert (stored.format, stored.width) == ("WEBP", 1280)

    assert await audit_actions(session, "product_image") == ["create"]


async def test_a_name_from_the_client_is_never_used(
    client: AsyncClient, admin: User, tmp_path: Path
) -> None:
    created = await product(client)

    response = await upload(
        client, f"/products/{created['id']}/images", name="../../etc/passwd.jpg"
    )

    assert response.status_code == 201
    assert "passwd" not in response.json()["url"]
    assert not any("passwd" in name for name in files_in(tmp_path))


async def test_the_image_reaches_the_public_api_with_its_size(
    client: AsyncClient, admin: User
) -> None:
    created = await product(client)
    await post(
        client, f"/products/{created['id']}/variants", sku="SKU-1", price_usd="10.00", stock=3
    )
    public = f"/api/v1/products/{created['slug']}"
    assert (await client.get(public, params=USD)).json()["image"] is None

    uploaded = (await upload(client, f"/products/{created['id']}/images")).json()

    body = (await client.get(public, params=USD)).json()
    assert body["image"] == {
        "url": uploaded["url"],
        "alt": "Taladro",
        "width": 1280,
        "height": 960,
    }
    assert [image["url"] for image in body["images"]] == [uploaded["url"]]


async def test_the_admin_product_lists_its_images(client: AsyncClient, admin: User) -> None:
    created = await product(client)
    uploaded = (await upload(client, f"/products/{created['id']}/images")).json()

    body = (await client.get(f"{ADMIN}/products/{created['id']}")).json()

    assert [image["id"] for image in body["images"]] == [uploaded["id"]]


async def test_positions_grow_with_each_upload(client: AsyncClient, admin: User) -> None:
    created = await product(client)
    path = f"/products/{created['id']}/images"

    first = (await upload(client, path)).json()
    await client.patch(f"{ADMIN}/images/{first['id']}", json={"position": 7})
    second = (await upload(client, path)).json()

    assert second["position"] == 8


@pytest.mark.parametrize(
    ("data", "name"),
    [
        (b"not an image at all", "foto.png"),
        (b"<svg xmlns='http://www.w3.org/2000/svg'></svg>", "foto.svg"),
        (encoded((50, 50), format="GIF"), "foto.jpg"),
    ],
    ids=["renamed-text", "svg", "gif"],
)
async def test_anything_but_a_real_image_is_rejected(
    client: AsyncClient,
    session: AsyncSession,
    admin: User,
    tmp_path: Path,
    data: bytes,
    name: str,
) -> None:
    created = await product(client)

    response = await upload(client, f"/products/{created['id']}/images", data, name)

    assert response.status_code == 422
    assert response.json()["code"] == "invalid_image"
    assert files_in(tmp_path) == []
    assert await audit_actions(session, "product_image") == []


async def test_a_missing_file_is_rejected(client: AsyncClient, admin: User) -> None:
    created = await product(client)

    response = await client.post(f"{ADMIN}/products/{created['id']}/images", data={"a": "b"})

    assert response.status_code == 422


async def test_an_unknown_product_answers_404_and_writes_nothing(
    client: AsyncClient, admin: User, tmp_path: Path
) -> None:
    response = await upload(client, "/products/999999/images")

    assert response.status_code == 404
    assert files_in(tmp_path) == []


async def test_upload_routes_accept_more_than_the_general_limit(
    client: AsyncClient, admin: User
) -> None:
    created = await product(client)
    buffer = io.BytesIO()
    Image.frombytes("RGB", (800, 800), os.urandom(800 * 800 * 3)).save(buffer, format="PNG")
    source = buffer.getvalue()
    assert len(source) > MIB

    response = await upload(client, f"/products/{created['id']}/images", source, "ruido.png")

    assert response.status_code == 201, response.json()


async def test_other_routes_keep_the_general_limit(client: AsyncClient, admin: User) -> None:
    created = await product(client)

    response = await client.patch(
        f"{ADMIN}/products/{created['id']}",
        content=b"x" * (MIB + 1),
        headers={"Content-Type": "application/json"},
    )

    assert response.status_code == 413
    assert response.json()["code"] == "payload_too_large"


async def test_a_file_over_5_mib_answers_413(
    client: AsyncClient, admin: User, tmp_path: Path
) -> None:
    created = await product(client)
    path = f"/products/{created['id']}/images"

    just_over = await upload(client, path, b"x" * (5 * MIB + 1))
    assert just_over.status_code == 413
    assert just_over.json()["code"] == "payload_too_large"

    far_over = await upload(client, path, b"x" * (6 * MIB))
    assert far_over.status_code == 413
    assert files_in(tmp_path) == []


async def test_a_product_has_up_to_12_images_and_the_rejected_files_go_away(
    client: AsyncClient, session: AsyncSession, admin: User, tmp_path: Path
) -> None:
    created = await product(client)
    path = f"/products/{created['id']}/images"
    source = encoded((100, 100))
    for _ in range(MAX_PRODUCT_IMAGES):
        assert (await upload(client, path, source)).status_code == 201
    stored = files_in(tmp_path)

    response = await upload(client, path, source)

    assert response.status_code == 409
    assert response.json()["code"] == "too_many_images"
    assert files_in(tmp_path) == stored
    assert await session.scalar(
        select(func.count()).select_from(ProductImage).where(
            ProductImage.product_id == created["id"]
        )
    ) == MAX_PRODUCT_IMAGES


async def test_alt_position_and_variant_can_change(
    client: AsyncClient, session: AsyncSession, admin: User
) -> None:
    created = await product(client)
    variant = await post(
        client, f"/products/{created['id']}/variants", sku="SKU-1", price_usd="10.00", stock=3
    )
    image = (await upload(client, f"/products/{created['id']}/images")).json()
    url = f"{ADMIN}/images/{image['id']}"

    response = await client.patch(
        url, json={"alt": {"es": "Frente", "en": "Front"}, "variant_id": variant["id"]}
    )

    assert response.status_code == 200
    assert response.json()["variant_id"] == variant["id"]
    public = await client.get(
        f"/api/v1/products/{created['slug']}", params=USD | {"locale": "en"}
    )
    assert public.json()["images"][0]["alt"] == "Front"

    cleared = await client.patch(url, json={"alt": None, "variant_id": None})
    assert cleared.status_code == 200
    assert (cleared.json()["alt"], cleared.json()["variant_id"]) == (None, None)
    assert await audit_actions(session, "product_image") == ["create", "update", "update"]


async def test_the_position_orders_the_public_gallery(client: AsyncClient, admin: User) -> None:
    created = await product(client)
    await post(
        client, f"/products/{created['id']}/variants", sku="SKU-1", price_usd="10.00", stock=3
    )
    path = f"/products/{created['id']}/images"
    first = (await upload(client, path)).json()
    second = (await upload(client, path)).json()

    await client.patch(f"{ADMIN}/images/{first['id']}", json={"position": 5})

    body = (await client.get(f"/api/v1/products/{created['slug']}", params=USD)).json()
    assert body["image"]["url"] == second["url"]


async def test_the_variant_must_belong_to_the_product(client: AsyncClient, admin: User) -> None:
    created = await product(client)
    other = await product(client, "otro")
    foreign = await post(
        client, f"/products/{other['id']}/variants", sku="SKU-2", price_usd="10.00"
    )
    image = (await upload(client, f"/products/{created['id']}/images")).json()

    response = await client.patch(
        f"{ADMIN}/images/{image['id']}", json={"variant_id": foreign["id"]}
    )

    assert response.status_code == 422
    assert response.json()["code"] == "unknown_variant"


async def test_delete_removes_the_row_and_the_files(
    client: AsyncClient,
    session: AsyncSession,
    admin: User,
    tmp_path: Path,
    revalidations: RevalidationLog,
) -> None:
    created = await product(client)
    image = (await upload(client, f"/products/{created['id']}/images")).json()
    revalidations.tags.clear()

    response = await client.delete(f"{ADMIN}/images/{image['id']}")

    assert response.status_code == 204
    assert files_in(tmp_path) == []
    assert await session.get(ProductImage, image["id"]) is None
    assert await audit_actions(session, "product_image") == ["create", "delete"]
    assert revalidations.tags == [["catalog"]]


async def test_missing_image_answers_404(client: AsyncClient, admin: User) -> None:
    assert (await client.patch(f"{ADMIN}/images/999999", json={})).status_code == 404
    assert (await client.delete(f"{ADMIN}/images/999999")).status_code == 404


async def test_a_brand_logo_can_be_set_replaced_and_cleared(
    client: AsyncClient, session: AsyncSession, admin: User, tmp_path: Path
) -> None:
    brand = await post(client, "/brands", slug="acme", name="ACME")
    assert brand["logo_url"] is None
    logo = encoded((400, 100), format="PNG", mode="RGBA", color=(0, 0, 255, 128))

    first = await upload(client, f"/brands/{brand['id']}/logo", logo, "logo.png")
    assert first.status_code == 200, first.json()
    first_url = first.json()["logo_url"]
    assert first_url.startswith(f"/media/brands/{brand['id']}/")
    public = (await client.get("/api/v1/brands")).json()
    assert [row["logo_url"] for row in public if row["slug"] == "acme"] == [first_url]

    second = await upload(client, f"/brands/{brand['id']}/logo", logo, "logo.png")
    assert second.json()["logo_url"] != first_url
    assert len(files_in(tmp_path)) == len(IMAGE_WIDTHS)

    cleared = await client.delete(f"{ADMIN}/brands/{brand['id']}/logo")
    assert cleared.status_code == 200
    assert cleared.json()["logo_url"] is None
    assert files_in(tmp_path) == []

    actions = await audit_actions(session, "brand")
    assert actions == ["create", "update", "update", "update"]


async def test_deleting_a_brand_removes_its_logo(
    client: AsyncClient, admin: User, tmp_path: Path
) -> None:
    brand = await post(client, "/brands", slug="acme", name="ACME")
    await upload(client, f"/brands/{brand['id']}/logo")
    assert files_in(tmp_path) != []

    assert (await client.delete(f"{ADMIN}/brands/{brand['id']}")).status_code == 204

    assert files_in(tmp_path) == []


async def test_a_brand_in_use_keeps_its_logo(
    client: AsyncClient, admin: User, tmp_path: Path
) -> None:
    brand = await post(client, "/brands", slug="acme", name="ACME")
    category = await post(client, "/categories", slug="raiz", name=LABEL)
    await post(
        client,
        "/products",
        slug="con-marca",
        category_id=category["id"],
        brand_id=brand["id"],
        translations={"es": TEXT, "en": TEXT},
    )
    await upload(client, f"/brands/{brand['id']}/logo")
    stored = files_in(tmp_path)

    assert (await client.delete(f"{ADMIN}/brands/{brand['id']}")).status_code == 409

    assert files_in(tmp_path) == stored


async def test_a_category_image_reaches_the_public_tree(
    client: AsyncClient, admin: User, tmp_path: Path
) -> None:
    category = await post(client, "/categories", slug="raiz", name=LABEL)
    await client.get("/api/v1/categories")

    response = await upload(client, f"/categories/{category['id']}/image")

    assert response.status_code == 200, response.json()
    url = response.json()["image_url"]
    tree = (await client.get("/api/v1/categories")).json()
    assert [node["image_url"] for node in tree if node["slug"] == "raiz"] == [url]

    await client.delete(f"{ADMIN}/categories/{category['id']}/image")
    assert files_in(tmp_path) == []


async def test_a_picture_for_an_unknown_owner_writes_nothing(
    client: AsyncClient, admin: User, tmp_path: Path
) -> None:
    assert (await upload(client, "/brands/999999/logo")).status_code == 404
    assert (await upload(client, "/categories/999999/image")).status_code == 404
    assert files_in(tmp_path) == []


async def test_an_invalid_logo_keeps_the_current_one(
    client: AsyncClient, admin: User, tmp_path: Path
) -> None:
    brand = await post(client, "/brands", slug="acme", name="ACME")
    current = (await upload(client, f"/brands/{brand['id']}/logo")).json()["logo_url"]

    response = await upload(client, f"/brands/{brand['id']}/logo", b"nope", "logo.png")

    assert response.status_code == 422
    assert (await client.get(f"{ADMIN}/brands/{brand['id']}")).json()["logo_url"] == current
    assert len(files_in(tmp_path)) == len(IMAGE_WIDTHS)
