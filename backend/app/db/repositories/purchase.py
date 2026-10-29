from sqlalchemy import delete, select
from sqlalchemy.dialects.mysql import insert
from sqlalchemy.orm import selectinload

from app.db.repositories.base import SqlAlchemyRepository
from app.models import Cart, CartItem


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
