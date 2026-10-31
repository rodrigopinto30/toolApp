import type { components } from "@/lib/api/schema";

type Schemas = components["schemas"];

export type AdminCategory = Schemas["AdminCategoryRead"];
export type AdminBrand = Schemas["AdminBrandRead"];
export type AdminAttribute = Schemas["AdminAttributeRead"];
export type AdminAttributeValue = Schemas["AdminAttributeValueRead"];
export type AdminProduct = Schemas["AdminProductRead"];
export type AdminProductSummary = Schemas["AdminProductSummary"];
export type AdminVariant = Schemas["AdminVariantRead"];
export type AdminImage = Schemas["AdminImageRead"];
export type ProductFilters = { q?: string; category_id?: number; brand_id?: number; is_active?: boolean };
