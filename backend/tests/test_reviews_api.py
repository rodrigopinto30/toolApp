from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Address, Product, Review, ReviewStatus, User
from tests.factories import make_review, make_user
from tests.shopping import (
    PASSWORD,
    add_to_cart,
    count,
    deliver,
    login,
    place_order,
    product_of,
    shipping_body,
)

pytestmark = pytest.mark.usefixtures("seeded", "gateway")

SKU = "STA-SD6"
OTHER_SKU = "BOS-HD18-18V"
BODY = {"rating": 4, "title": "Solid", "body": "Does the job."}


def reviews_path(slug: str) -> str:
    return f"/api/v1/products/{slug}/reviews"


async def buy(client: AsyncClient, session: AsyncSession, address: Address, sku: str = SKU) -> str:
    await add_to_cart(client, session, sku, 1)
    response = await place_order(client, shipping_body(address))
    assert response.json()["status"] == "paid"
    return response.json()["number"]


@pytest.fixture
async def bought(
    client: AsyncClient, session: AsyncSession, customer: User, address: Address
) -> Product:
    await deliver(session, await buy(client, session, address))
    return await product_of(session, SKU)


async def test_lists_approved_reviews_newest_first_without_emails(
    client: AsyncClient, session: AsyncSession
) -> None:
    product = await product_of(session, SKU)
    author = await make_user(session)
    other = await make_user(session)
    first = await make_review(session, product.id, author, status=ReviewStatus.APPROVED, title="One")
    second = await make_review(session, product.id, other, status=ReviewStatus.APPROVED, title="Two")
    await make_review(session, product.id, await make_user(session))
    await make_review(session, product.id, await make_user(session), status=ReviewStatus.REJECTED)

    response = await client.get(reviews_path(product.slug))

    body = response.json()
    assert response.status_code == 200
    assert response.headers["cache-control"] == "public, max-age=60"
    assert body["total"] == 2
    assert [item["id"] for item in body["items"]] == [second.id, first.id]
    assert body["items"][0]["author"] == "Ana D."
    assert set(body["items"][0]) == {"id", "rating", "title", "body", "author", "created_at"}
    assert author.email not in response.text


async def test_pages_the_list(client: AsyncClient, session: AsyncSession) -> None:
    product = await product_of(session, SKU)
    for _ in range(3):
        await make_review(
            session, product.id, await make_user(session), status=ReviewStatus.APPROVED
        )

    body = (await client.get(reviews_path(product.slug), params={"page": 2, "size": 2})).json()

    assert (body["total"], body["pages"], len(body["items"])) == (3, 2, 1)


async def test_a_product_without_reviews_answers_an_empty_page(
    client: AsyncClient, session: AsyncSession
) -> None:
    product = await product_of(session, SKU)

    body = (await client.get(reviews_path(product.slug))).json()

    assert (body["items"], body["total"], body["pages"]) == ([], 0, 0)


async def test_a_hidden_or_unknown_product_answers_404(
    client: AsyncClient, session: AsyncSession
) -> None:
    product = await product_of(session, SKU)
    await session.execute(update(Product).where(Product.id == product.id).values(is_active=False))

    assert (await client.get(reviews_path(product.slug))).status_code == 404
    assert (await client.get(reviews_path("unknown"))).status_code == 404


async def test_a_buyer_reviews_a_delivered_product(
    client: AsyncClient, session: AsyncSession, bought: Product
) -> None:
    response = await client.post(reviews_path(bought.slug), json=BODY, params={"locale": "en"})

    review = response.json()
    assert response.status_code == 201
    assert (review["status"], review["rating"], review["title"]) == ("pending", 4, "Solid")
    assert review["product"]["slug"] == bought.slug
    assert review["product"]["image"] is None or review["product"]["image"]["url"]
    assert (await client.get(reviews_path(bought.slug))).json()["total"] == 0


async def test_a_second_review_of_the_same_product_is_rejected(
    client: AsyncClient, session: AsyncSession, bought: Product
) -> None:
    await client.post(reviews_path(bought.slug), json=BODY)

    response = await client.post(reviews_path(bought.slug), json=BODY)

    assert (response.status_code, response.json()["code"]) == (409, "review_exists")
    assert await count(session, Review) == 1


async def test_a_rejected_review_cannot_be_sent_again(
    client: AsyncClient, session: AsyncSession, bought: Product, customer: User
) -> None:
    await make_review(session, bought.id, customer, status=ReviewStatus.REJECTED)

    response = await client.post(reviews_path(bought.slug), json=BODY)

    assert (response.status_code, response.json()["code"]) == (409, "review_exists")


@pytest.mark.usefixtures("customer")
async def test_a_customer_who_did_not_buy_it_cannot_review(
    client: AsyncClient, session: AsyncSession
) -> None:
    product = await product_of(session, SKU)

    response = await client.post(reviews_path(product.slug), json=BODY)

    assert (response.status_code, response.json()["code"]) == (403, "review_not_allowed")


@pytest.mark.usefixtures("customer")
async def test_an_order_not_yet_delivered_does_not_count(
    client: AsyncClient, session: AsyncSession, address: Address
) -> None:
    await buy(client, session, address)
    product = await product_of(session, SKU)

    response = await client.post(reviews_path(product.slug), json=BODY)

    assert (response.status_code, response.json()["code"]) == (403, "review_not_allowed")


async def test_a_delivered_order_of_another_customer_does_not_count(
    client: AsyncClient, session: AsyncSession, bought: Product
) -> None:
    other = await make_user(session, password=PASSWORD, verified=True)
    await login(client, other)

    response = await client.post(reviews_path(bought.slug), json=BODY)

    assert (response.status_code, response.json()["code"]) == (403, "review_not_allowed")


async def test_a_visitor_and_an_unverified_customer_cannot_review(
    client: AsyncClient, session: AsyncSession
) -> None:
    product = await product_of(session, SKU)
    assert (await client.post(reviews_path(product.slug), json=BODY)).status_code == 401

    await login(client, await make_user(session, password=PASSWORD))

    response = await client.post(reviews_path(product.slug), json=BODY)
    assert (response.status_code, response.json()["code"]) == (403, "email_not_verified")


async def test_a_hidden_product_cannot_be_reviewed(
    client: AsyncClient, session: AsyncSession, bought: Product
) -> None:
    await session.execute(update(Product).where(Product.id == bought.id).values(is_active=False))

    assert (await client.post(reviews_path(bought.slug), json=BODY)).status_code == 404


@pytest.mark.parametrize(
    "change",
    [
        {"rating": 0},
        {"rating": 6},
        {"rating": 4.5},
        {"title": ""},
        {"title": "   "},
        {"title": "x" * 121},
        {"body": ""},
        {"body": "x" * 2001},
        {"extra": 1},
    ],
)
async def test_an_invalid_review_is_rejected(
    client: AsyncClient, bought: Product, change: dict[str, Any]
) -> None:
    response = await client.post(reviews_path(bought.slug), json=BODY | change)

    assert response.status_code == 422


@pytest.mark.usefixtures("customer")
async def test_reviews_are_limited_per_user(client: AsyncClient) -> None:
    for _ in range(10):
        assert (await client.post(reviews_path("unknown"), json=BODY)).status_code == 404

    response = await client.post(reviews_path("unknown"), json=BODY)

    assert (response.status_code, response.json()["code"]) == (429, "rate_limited")


async def test_own_reviews_show_their_status(
    client: AsyncClient, session: AsyncSession, customer: User
) -> None:
    product = await product_of(session, SKU)
    other_product = await product_of(session, OTHER_SKU)
    rejected = await make_review(session, product.id, customer, status=ReviewStatus.REJECTED)
    pending = await make_review(session, other_product.id, customer)
    await make_review(session, product.id, await make_user(session))

    body = (await client.get("/api/v1/me/reviews", params={"locale": "en"})).json()

    assert body["total"] == 2
    assert {item["id"]: item["status"] for item in body["items"]} == {
        rejected.id: "rejected",
        pending.id: "pending",
    }
    assert {item["product"]["slug"] for item in body["items"]} == {
        product.slug,
        other_product.slug,
    }


async def test_reviewable_lists_delivered_products_without_a_review(
    client: AsyncClient, session: AsyncSession, bought: Product, address: Address
) -> None:
    await buy(client, session, address, OTHER_SKU)

    pending = (await client.get("/api/v1/me/reviewable", params={"locale": "en"})).json()
    assert [item["slug"] for item in pending["items"]] == [bought.slug]
    assert pending["items"][0]["name"]

    await client.post(reviews_path(bought.slug), json=BODY)

    assert (await client.get("/api/v1/me/reviewable")).json()["total"] == 0


async def test_a_hidden_product_is_not_reviewable(
    client: AsyncClient, session: AsyncSession, bought: Product
) -> None:
    await session.execute(update(Product).where(Product.id == bought.id).values(is_active=False))

    assert (await client.get("/api/v1/me/reviewable")).json()["total"] == 0


async def test_account_reviews_need_a_session(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/me/reviews")).status_code == 401
    assert (await client.get("/api/v1/me/reviewable")).status_code == 401
