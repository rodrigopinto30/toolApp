import pytest
from httpx import AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Favorite, Product, User
from tests.factories import make_user
from tests.shopping import PASSWORD, count, login, product_of

pytestmark = pytest.mark.usefixtures("seeded", "gateway")

FAVORITES = "/api/v1/me/favorites"
SKU = "STA-SD6"
OTHER_SKU = "BOS-HD18-18V"


async def set_active(session: AsyncSession, product: Product, is_active: bool) -> None:
    await session.execute(
        update(Product).where(Product.id == product.id).values(is_active=is_active)
    )


@pytest.mark.usefixtures("customer")
async def test_adds_and_lists_a_favorite_as_a_catalog_card(
    client: AsyncClient, session: AsyncSession
) -> None:
    product = await product_of(session, SKU)

    response = await client.put(f"{FAVORITES}/{product.slug}")
    assert response.status_code == 204

    body = (await client.get(FAVORITES, params={"currency": "USD", "locale": "en"})).json()
    catalog = await client.get(
        f"/api/v1/products/{product.slug}", params={"currency": "USD", "locale": "en"}
    )
    assert body["total"] == 1
    [card] = body["items"]
    assert card.keys() <= catalog.json().keys()
    assert card["slug"] == product.slug
    assert card["name"] == catalog.json()["name"]
    assert card["price_from"] == catalog.json()["price_from"]


@pytest.mark.usefixtures("customer")
async def test_prices_follow_the_requested_currency(
    client: AsyncClient, session: AsyncSession
) -> None:
    product = await product_of(session, SKU)
    await client.put(f"{FAVORITES}/{product.slug}")

    body = (await client.get(FAVORITES, params={"currency": "ARS"})).json()

    assert body["items"][0]["price_from"]["currency"] == "ARS"


@pytest.mark.usefixtures("customer")
async def test_adding_twice_keeps_one_favorite(client: AsyncClient, session: AsyncSession) -> None:
    product = await product_of(session, SKU)

    assert (await client.put(f"{FAVORITES}/{product.slug}")).status_code == 204
    assert (await client.put(f"{FAVORITES}/{product.slug}")).status_code == 204

    assert await count(session, Favorite) == 1


@pytest.mark.usefixtures("customer")
async def test_the_newest_favorite_comes_first(client: AsyncClient, session: AsyncSession) -> None:
    first = await product_of(session, SKU)
    second = await product_of(session, OTHER_SKU)
    await client.put(f"{FAVORITES}/{first.slug}")
    await client.put(f"{FAVORITES}/{second.slug}")

    body = (await client.get(FAVORITES, params={"currency": "USD"})).json()

    assert [card["slug"] for card in body["items"]] == [second.slug, first.slug]


@pytest.mark.usefixtures("customer")
async def test_pages_the_list(client: AsyncClient, session: AsyncSession) -> None:
    for sku in (SKU, OTHER_SKU):
        await client.put(f"{FAVORITES}/{(await product_of(session, sku)).slug}")

    params = {"currency": "USD", "page": 2, "size": 1}
    body = (await client.get(FAVORITES, params=params)).json()

    assert (body["total"], body["pages"], len(body["items"])) == (2, 2, 1)


@pytest.mark.usefixtures("customer")
async def test_removing_works_even_if_it_was_not_there(
    client: AsyncClient, session: AsyncSession
) -> None:
    product = await product_of(session, SKU)
    await client.put(f"{FAVORITES}/{product.slug}")

    assert (await client.delete(f"{FAVORITES}/{product.slug}")).status_code == 204
    assert (await client.delete(f"{FAVORITES}/{product.slug}")).status_code == 204

    assert await count(session, Favorite) == 0


@pytest.mark.usefixtures("customer")
async def test_an_unknown_product_answers_404(client: AsyncClient) -> None:
    assert (await client.put(f"{FAVORITES}/unknown")).status_code == 404
    assert (await client.delete(f"{FAVORITES}/unknown")).status_code == 404


@pytest.mark.usefixtures("customer")
async def test_an_invalid_slug_answers_422(client: AsyncClient) -> None:
    assert (await client.put(f"{FAVORITES}/Not_A_Slug")).status_code == 422


@pytest.mark.usefixtures("customer")
async def test_a_hidden_product_leaves_the_list_and_comes_back(
    client: AsyncClient, session: AsyncSession
) -> None:
    product = await product_of(session, SKU)
    await client.put(f"{FAVORITES}/{product.slug}")

    await set_active(session, product, False)
    assert (await client.get(FAVORITES, params={"currency": "USD"})).json()["total"] == 0

    await set_active(session, product, True)
    assert (await client.get(FAVORITES, params={"currency": "USD"})).json()["total"] == 1


@pytest.mark.usefixtures("customer")
async def test_a_hidden_product_cannot_be_added_but_can_be_removed(
    client: AsyncClient, session: AsyncSession
) -> None:
    product = await product_of(session, SKU)
    await client.put(f"{FAVORITES}/{product.slug}")
    await set_active(session, product, False)

    assert (await client.put(f"{FAVORITES}/{product.slug}")).status_code == 404
    assert (await client.delete(f"{FAVORITES}/{product.slug}")).status_code == 204
    assert await count(session, Favorite) == 0


async def test_favorites_belong_to_their_customer(
    client: AsyncClient, session: AsyncSession, customer: User
) -> None:
    product = await product_of(session, SKU)
    await client.put(f"{FAVORITES}/{product.slug}")
    other = await make_user(session, password=PASSWORD, verified=True)
    await login(client, other)

    assert (await client.get(FAVORITES, params={"currency": "USD"})).json()["total"] == 0

    await client.delete(f"{FAVORITES}/{product.slug}")

    owners = await session.scalars(select(Favorite.user_id))
    assert owners.all() == [customer.id]


async def test_a_visitor_gets_401(client: AsyncClient) -> None:
    assert (await client.get(FAVORITES)).status_code == 401
    assert (await client.put(f"{FAVORITES}/any-product")).status_code == 401
    assert (await client.delete(f"{FAVORITES}/any-product")).status_code == 401
