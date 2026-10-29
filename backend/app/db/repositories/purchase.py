from collections.abc import Sequence

from sqlalchemy import Select, and_, delete, func, select
from sqlalchemy.dialects.mysql import insert
from sqlalchemy.orm import selectinload
from sqlalchemy.sql import ColumnElement

from app.db.repositories.base import SqlAlchemyRepository
from app.models import Cart, CartItem, Coupon, CouponRedemption, Order, OrderItem


class CartRepository(SqlAlchemyRepository[Cart]):
    model = Cart

    async def for_user(self, user_id: int) -> Cart | None:
        statement = select(Cart).where(Cart.user_id == user_id).options(selectinload(Cart.items))
        return await self.session.scalar(statement)

    async def lock_or_create(self, user_id: int) -> Cart:
        upsert = insert(Cart).values(user_id=user_id)
        await self.session.execute(upsert.on_duplicate_key_update(user_id=upsert.inserted.user_id))
        statement = (
            select(Cart)
            .where(Cart.user_id == user_id)
            .options(selectinload(Cart.items))
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        return (await self.session.scalars(statement)).one()

    async def remove_item(self, user_id: int, variant_id: int) -> None:
        await self.session.execute(
            delete(CartItem).where(
                CartItem.variant_id == variant_id,
                CartItem.cart_id.in_(select(Cart.id).where(Cart.user_id == user_id)),
            )
        )


class CouponRepository(SqlAlchemyRepository[Coupon]):
    model = Coupon

    async def by_code(self, code: str, *, lock: bool = False) -> Coupon | None:
        statement = select(Coupon).where(Coupon.code == code)
        if lock:
            statement = statement.with_for_update().execution_options(populate_existing=True)
        return await self.session.scalar(statement)

    async def locked(self, coupon_id: int) -> Coupon | None:
        return await self.session.get(Coupon, coupon_id, with_for_update=True, populate_existing=True)

    async def remove_redemption(self, order_id: int) -> None:
        await self.session.execute(
            delete(CouponRedemption).where(CouponRedemption.order_id == order_id)
        )

    async def redemptions(self, coupon_id: int, user_id: int) -> int:
        statement = select(func.count()).where(
            CouponRedemption.coupon_id == coupon_id, CouponRedemption.user_id == user_id
        )
        return await self.session.scalar(statement) or 0


class OrderRepository(SqlAlchemyRepository[Order]):
    model = Order

    async def by_idempotency_key(self, user_id: int, key: str, *, lock: bool = False) -> Order | None:
        statement = select(Order).where(Order.user_id == user_id, Order.idempotency_key == key)
        if lock:
            statement = statement.with_for_update(read=True)
        return await self.session.scalar(statement)

    async def detail(self, order_id: int, *, lock: bool = False) -> Order:
        return (await self.session.scalars(_detail(Order.id == order_id, lock=lock))).one()

    async def owned(self, user_id: int, number: str, *, lock: bool = False) -> Order | None:
        condition = and_(Order.user_id == user_id, Order.number == number)
        return await self.session.scalar(_detail(condition, lock=lock))

    async def page_for(
        self, user_id: int, *, offset: int, limit: int
    ) -> tuple[Sequence[tuple[Order, int]], int]:
        item_count = (
            select(func.coalesce(func.sum(OrderItem.quantity), 0))
            .where(OrderItem.order_id == Order.id)
            .scalar_subquery()
        )
        statement = (
            select(Order, item_count)
            .where(Order.user_id == user_id)
            .order_by(Order.created_at.desc(), Order.id.desc())
            .offset(offset)
            .limit(limit)
        )
        rows = [(order, int(count)) for order, count in await self.session.execute(statement)]
        return rows, await self.count(user_id=user_id)


def _detail(condition: ColumnElement[bool], *, lock: bool) -> Select[tuple[Order]]:
    statement = (
        select(Order)
        .where(condition)
        .options(
            selectinload(Order.items),
            selectinload(Order.status_history),
            selectinload(Order.payments),
        )
        .execution_options(populate_existing=True)
    )
    return statement.with_for_update() if lock else statement
