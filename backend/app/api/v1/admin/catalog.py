from fastapi import APIRouter, status

from app.api.v1.admin.deps import (
    AttributeAdminDep,
    AttributeValueAdminDep,
    BrandAdminDep,
    CategoryAdminDep,
    EntityId,
    ImageBytes,
    PageParams,
)
from app.schemas.admin.catalog import (
    AdminAttributeRead,
    AdminAttributeValueRead,
    AdminBrandRead,
    AdminCategoryRead,
    AttributeCreate,
    AttributeUpdate,
    AttributeValueCreate,
    AttributeValueUpdate,
    BrandCreate,
    BrandUpdate,
    CategoryCreate,
    CategoryUpdate,
)
from app.schemas.common import Page

router = APIRouter()


@router.get("/categories")
async def list_categories(
    params: PageParams, categories: CategoryAdminDep
) -> Page[AdminCategoryRead]:
    return await categories.page(params)


@router.post("/categories", status_code=status.HTTP_201_CREATED)
async def create_category(body: CategoryCreate, categories: CategoryAdminDep) -> AdminCategoryRead:
    return await categories.create(body)


@router.get("/categories/{category_id}")
async def get_category(category_id: EntityId, categories: CategoryAdminDep) -> AdminCategoryRead:
    return await categories.detail(category_id)


@router.patch("/categories/{category_id}")
async def update_category(
    category_id: EntityId, body: CategoryUpdate, categories: CategoryAdminDep
) -> AdminCategoryRead:
    return await categories.update(category_id, body)


@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(category_id: EntityId, categories: CategoryAdminDep) -> None:
    await categories.delete(category_id)


@router.post("/categories/{category_id}/image")
async def upload_category_image(
    category_id: EntityId, data: ImageBytes, categories: CategoryAdminDep
) -> AdminCategoryRead:
    return await categories.set_picture(category_id, data)


@router.delete("/categories/{category_id}/image")
async def delete_category_image(
    category_id: EntityId, categories: CategoryAdminDep
) -> AdminCategoryRead:
    return await categories.clear_picture(category_id)


@router.get("/brands")
async def list_brands(params: PageParams, brands: BrandAdminDep) -> Page[AdminBrandRead]:
    return await brands.page(params)


@router.post("/brands", status_code=status.HTTP_201_CREATED)
async def create_brand(body: BrandCreate, brands: BrandAdminDep) -> AdminBrandRead:
    return await brands.create(body)


@router.get("/brands/{brand_id}")
async def get_brand(brand_id: EntityId, brands: BrandAdminDep) -> AdminBrandRead:
    return await brands.detail(brand_id)


@router.patch("/brands/{brand_id}")
async def update_brand(
    brand_id: EntityId, body: BrandUpdate, brands: BrandAdminDep
) -> AdminBrandRead:
    return await brands.update(brand_id, body)


@router.delete("/brands/{brand_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_brand(brand_id: EntityId, brands: BrandAdminDep) -> None:
    await brands.delete(brand_id)


@router.post("/brands/{brand_id}/logo")
async def upload_brand_logo(
    brand_id: EntityId, data: ImageBytes, brands: BrandAdminDep
) -> AdminBrandRead:
    return await brands.set_picture(brand_id, data)


@router.delete("/brands/{brand_id}/logo")
async def delete_brand_logo(brand_id: EntityId, brands: BrandAdminDep) -> AdminBrandRead:
    return await brands.clear_picture(brand_id)


@router.get("/attributes")
async def list_attributes(
    params: PageParams, attributes: AttributeAdminDep
) -> Page[AdminAttributeRead]:
    return await attributes.page(params)


@router.post("/attributes", status_code=status.HTTP_201_CREATED)
async def create_attribute(
    body: AttributeCreate, attributes: AttributeAdminDep
) -> AdminAttributeRead:
    return await attributes.create(body)


@router.get("/attributes/{attribute_id}")
async def get_attribute(
    attribute_id: EntityId, attributes: AttributeAdminDep
) -> AdminAttributeRead:
    return await attributes.detail(attribute_id)


@router.patch("/attributes/{attribute_id}")
async def update_attribute(
    attribute_id: EntityId, body: AttributeUpdate, attributes: AttributeAdminDep
) -> AdminAttributeRead:
    return await attributes.update(attribute_id, body)


@router.delete("/attributes/{attribute_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_attribute(attribute_id: EntityId, attributes: AttributeAdminDep) -> None:
    await attributes.delete(attribute_id)


@router.get("/attributes/{attribute_id}/values")
async def list_attribute_values(
    params: PageParams, values: AttributeValueAdminDep
) -> Page[AdminAttributeValueRead]:
    return await values.page(params)


@router.post("/attributes/{attribute_id}/values", status_code=status.HTTP_201_CREATED)
async def create_attribute_value(
    body: AttributeValueCreate, values: AttributeValueAdminDep
) -> AdminAttributeValueRead:
    return await values.create(body)


@router.get("/attributes/{attribute_id}/values/{value_id}")
async def get_attribute_value(
    value_id: EntityId, values: AttributeValueAdminDep
) -> AdminAttributeValueRead:
    return await values.detail(value_id)


@router.patch("/attributes/{attribute_id}/values/{value_id}")
async def update_attribute_value(
    value_id: EntityId, body: AttributeValueUpdate, values: AttributeValueAdminDep
) -> AdminAttributeValueRead:
    return await values.update(value_id, body)


@router.delete(
    "/attributes/{attribute_id}/values/{value_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_attribute_value(value_id: EntityId, values: AttributeValueAdminDep) -> None:
    await values.delete(value_id)
