export const ADMIN_PRODUCTS_PATH = "/admin/products";
export const ADMIN_NEW_PRODUCT_PATH = "/admin/products/new";
export const ADMIN_CATEGORIES_PATH = "/admin/categories";
export const ADMIN_BRANDS_PATH = "/admin/brands";
export const ADMIN_ATTRIBUTES_PATH = "/admin/attributes";

const ENTITY_ID_PATTERN = /^[1-9]\d{0,17}$/;

export function adminProductPath(id: number): string {
  return `${ADMIN_PRODUCTS_PATH}/${id}`;
}

export function isEntityId(value: string): boolean {
  return ENTITY_ID_PATTERN.test(value);
}
