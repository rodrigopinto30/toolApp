from sqlalchemy import delete, func, select
from sqlalchemy.dialects.mysql import insert
from sqlalchemy.orm import selectinload

from app.db.repositories.base import SqlAlchemyRepository
from app.models import Cart, CartItem, Coupon, CouponRedemption, Order


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
        statement = (
            select(Order)
            .where(Order.id == order_id)
            .options(
                selectinload(Order.items),
                selectinload(Order.status_history),
                selectinload(Order.payments),
            )
            .execution_options(populate_existing=True)
        )
        if lock:
            statement = statement.with_for_update()
        return (await self.session.scalars(statement)).one()
