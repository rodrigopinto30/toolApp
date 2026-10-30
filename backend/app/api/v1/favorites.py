from typing import Annotated

from fastapi import APIRouter, Query, status

from app.api.v1.deps import CurrentUser
from app.core.container import FavoriteServiceDep
from app.schemas.catalog import ProductCard, Slug
from app.schemas.common import Page
from app.schemas.favorites import FavoriteParams

router = APIRouter(prefix="/me/favorites", tags=["favorites"])


@router.get("")
async def list_favorites(
    user: CurrentUser, params: Annotated[FavoriteParams, Query()], favorites: FavoriteServiceDep
) -> Page[ProductCard]:
    return await favorites.page(user.id, params)


@router.put("/{slug}", status_code=status.HTTP_204_NO_CONTENT)
async def add_favorite(slug: Slug, user: CurrentUser, favorites: FavoriteServiceDep) -> None:
    await favorites.add(user.id, slug)


@router.delete("/{slug}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_favorite(slug: Slug, user: CurrentUser, favorites: FavoriteServiceDep) -> None:
    await favorites.remove(user.id, slug)
