from collections.abc import Sequence
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy.exc import IntegrityError

from app.cache.decorators import Cache, cached
from app.core.config import Settings
from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError
from app.db.repositories.catalog import ProductRepository
from app.db.repositories.community import ReviewRepository
from app.db.unit_of_work import SqlAlchemyUnitOfWork
from app.models import Locale, Product, Review, User
from app.schemas.common import Page
from app.schemas.reviews import (
    AccountReviewParams,
    OwnReviewRead,
    ReviewCreate,
    ReviewProduct,
    ReviewRead,
)
from app.services.catalog import product_image, product_translation

RATING_PLACES = Decimal("0.01")


def rating_summary(ratings: Sequence[int]) -> tuple[Decimal, int]:
    if not ratings:
        return Decimal(0).quantize(RATING_PLACES), 0
    average = Decimal(sum(ratings)) / len(ratings)
    return average.quantize(RATING_PLACES, rounding=ROUND_HALF_UP), len(ratings)


def review_product(product: Product, locale: Locale) -> ReviewProduct:
    name = product_translation(product, locale).name
    images = product.images
    return ReviewProduct(
        slug=product.slug,
        name=name,
        image=product_image(images[0], locale, name) if images else None,
    )


def own_review(review: Review, locale: Locale) -> OwnReviewRead:
    return OwnReviewRead(
        id=review.id,
        product=review_product(review.product, locale),
        rating=review.rating,
        title=review.title,
        body=review.body,
        status=review.status,
        created_at=review.created_at,
    )


class ReviewService:
    def __init__(self, uow: SqlAlchemyUnitOfWork, cache: Cache, settings: Settings) -> None:
        self.uow = uow
        self.cache = cache
        self.settings = settings

    @cached("catalog", ttl_setting="cache_ttl_catalog")
    async def for_product(self, slug: str, page: int, size: int) -> Page[ReviewRead]:
        async with self.uow:
            session = self.uow.session
            product_id = await ProductRepository(session).visible_id(slug)
            if product_id is None:
                raise NotFoundError("Product not found.")
            reviews, total = await ReviewRepository(session).approved_for(
                product_id, offset=(page - 1) * size, limit=size
            )
            items = [ReviewRead.from_review(review) for review in reviews]
        return Page.of(items, page=page, size=size, total=total)

    async def create(
        self, user: User, slug: str, body: ReviewCreate, locale: Locale
    ) -> OwnReviewRead:
        async with self.uow:
            session = self.uow.session
            products = ProductRepository(session)
            product_id = await products.visible_id(slug)
            if product_id is None:
                raise NotFoundError("Product not found.")
            if not await products.was_delivered_to(user.id, product_id):
                raise ForbiddenError(
                    "Only customers who received this product can review it.",
                    code="review_not_allowed",
                )
            reviews = ReviewRepository(session)
            review = reviews.add(Review(product_id=product_id, user_id=user.id, **body.model_dump()))
            try:
                await self.uow.flush()
            except IntegrityError as exc:
                raise ConflictError(
                    "You already reviewed this product.", code="review_exists"
                ) from exc
            return own_review(await reviews.with_product(review.id), locale)

    async def own(self, user_id: int, params: AccountReviewParams) -> Page[OwnReviewRead]:
        async with self.uow:
            reviews, total = await ReviewRepository(self.uow.session).own(
                user_id, offset=(params.page - 1) * params.size, limit=params.size
            )
            items = [own_review(review, params.locale) for review in reviews]
        return Page.of(items, page=params.page, size=params.size, total=total)

    async def reviewable(self, user_id: int, params: AccountReviewParams) -> Page[ReviewProduct]:
        async with self.uow:
            products, total = await ProductRepository(self.uow.session).reviewable(
                user_id,
                locale=params.locale,
                offset=(params.page - 1) * params.size,
                limit=params.size,
            )
            items = [review_product(product, params.locale) for product in products]
        return Page.of(items, page=params.page, size=params.size, total=total)
