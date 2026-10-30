from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditLog, Product, ReviewStatus, User
from tests.conftest import RevalidationLog
from tests.factories import make_review, make_user
from tests.shopping import product_of

pytestmark = pytest.mark.usefixtures("seeded", "gateway")

REVIEWS = "/api/v1/admin/reviews"
SKU = "STA-SD6"


@pytest.fixture
async def product(session: AsyncSession) -> Product:
    return await product_of(session, SKU)


async def rating(session: AsyncSession, product: Product) -> tuple[Decimal, int]:
    row = await session.execute(
        select(Product.rating_avg, Product.rating_count).where(Product.id == product.id)
    )
    average, count = row.one()
    return average, count


async def audit_rows(session: AsyncSession, review_id: int) -> list[AuditLog]:
    statement = select(AuditLog).where(
        AuditLog.entity == "review", AuditLog.entity_id == str(review_id)
    )
    return list((await session.scalars(statement)).all())


async def test_lists_reviews_with_author_and_product(
    client: AsyncClient, session: AsyncSession, admin: User, product: Product
) -> None:
    author = await make_user(session)
    review = await make_review(session, product.id, author, rating=3)

    response = await client.get(REVIEWS)

    body = response.json()
    assert response.status_code == 200
    assert body["total"] == 1
    item = body["items"][0]
    assert (item["id"], item["rating"], item["status"]) == (review.id, 3, "pending")
    assert item["author"]["email"] == author.email
    assert item["product"]["id"] == product.id
    assert set(item["product"]["name"]) == {"es", "en"}


async def test_filters_the_list(
    client: AsyncClient, session: AsyncSession, admin: User, product: Product
) -> None:
    other_product = await product_of(session, "BOS-HD18-18V")
    pending = await make_review(session, product.id, await make_user(session))
    approved = await make_review(
        session, product.id, await make_user(session), status=ReviewStatus.APPROVED
    )
    elsewhere = await make_review(session, other_product.id, await make_user(session))

    async def ids(**params: object) -> set[int]:
        body = (await client.get(REVIEWS, params=params)).json()
        assert body["total"] == len(body["items"])
        return {item["id"] for item in body["items"]}

    assert await ids(status="approved") == {approved.id}
    assert await ids(product_id=product.id) == {pending.id, approved.id}
    assert await ids(status="pending", product_id=other_product.id) == {elsewhere.id}


async def test_approving_recalculates_the_rating(
    client: AsyncClient,
    session: AsyncSession,
    admin: User,
    product: Product,
    revalidations: RevalidationLog,
) -> None:
    await make_review(
        session, product.id, await make_user(session), rating=5, status=ReviewStatus.APPROVED
    )
    review = await make_review(session, product.id, await make_user(session), rating=4)

    response = await client.post(f"{REVIEWS}/{review.id}/approve")

    assert (response.status_code, response.json()["status"]) == (200, "approved")
    assert await rating(session, product) == (Decimal("4.50"), 2)
    assert revalidations.tags == [["catalog"]]
    [row] = await audit_rows(session, review.id)
    assert (row.action, row.actor_id) == ("approve", admin.id)
    assert row.changes == {"status": {"before": "pending", "after": "approved"}}


async def test_rejecting_an_approved_review_recalculates_the_rating(
    client: AsyncClient, session: AsyncSession, admin: User, product: Product
) -> None:
    review = await make_review(session, product.id, await make_user(session), rating=5)
    await client.post(f"{REVIEWS}/{review.id}/approve")
    assert await rating(session, product) == (Decimal("5.00"), 1)

    response = await client.post(f"{REVIEWS}/{review.id}/reject")

    assert (response.status_code, response.json()["status"]) == (200, "rejected")
    assert await rating(session, product) == (Decimal("0.00"), 0)
    assert (await audit_rows(session, review.id))[-1].action == "reject"


async def test_rejecting_a_pending_review_leaves_the_rating_alone(
    client: AsyncClient, session: AsyncSession, admin: User, product: Product
) -> None:
    await make_review(
        session, product.id, await make_user(session), rating=4, status=ReviewStatus.APPROVED
    )
    await client.post(
        f"{REVIEWS}/{(await make_review(session, product.id, await make_user(session))).id}/approve"
    )
    review = await make_review(session, product.id, await make_user(session), rating=1)

    await client.post(f"{REVIEWS}/{review.id}/reject")

    assert await rating(session, product) == (Decimal("4.50"), 2)


async def test_approving_twice_changes_nothing_the_second_time(
    client: AsyncClient,
    session: AsyncSession,
    admin: User,
    product: Product,
    revalidations: RevalidationLog,
) -> None:
    review = await make_review(session, product.id, await make_user(session))
    await client.post(f"{REVIEWS}/{review.id}/approve")

    response = await client.post(f"{REVIEWS}/{review.id}/approve")

    assert response.status_code == 200
    assert len(await audit_rows(session, review.id)) == 1
    assert revalidations.tags == [["catalog"]]


async def test_moderation_reaches_the_public_api_at_once(
    client: AsyncClient, session: AsyncSession, admin: User, product: Product
) -> None:
    public = f"/api/v1/products/{product.slug}"
    review = await make_review(session, product.id, await make_user(session), rating=3)
    assert (await client.get(f"{public}/reviews")).json()["total"] == 0
    assert (await client.get(public, params={"currency": "USD"})).json()["rating_count"] == 0

    await client.post(f"{REVIEWS}/{review.id}/approve")

    assert (await client.get(f"{public}/reviews")).json()["total"] == 1
    detail = (await client.get(public, params={"currency": "USD"})).json()
    assert (detail["rating_avg"], detail["rating_count"]) == ("3.00", 1)

    await client.post(f"{REVIEWS}/{review.id}/reject")

    assert (await client.get(f"{public}/reviews")).json()["total"] == 0


async def test_an_unknown_review_answers_404(client: AsyncClient, admin: User) -> None:
    assert (await client.post(f"{REVIEWS}/999999/approve")).status_code == 404
    assert (await client.post(f"{REVIEWS}/999999/reject")).status_code == 404
