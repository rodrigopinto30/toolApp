import type { components, operations } from "@/lib/api/schema";

type Schemas = components["schemas"];

export type CategoryNode = Schemas["CategoryNode"];
export type ProductSummary = Schemas["ProductCard"];
export type ProductDetail = Schemas["ProductDetail"];
export type ProductPage = Schemas["Page_ProductCard_"];
export type ProductFacets = Schemas["ProductFacets"];
export type ProductImageData = Schemas["ImageRead"];
export type ProductSort = Schemas["ProductSort"];
export type StockStatus = Schemas["StockStatus"];
export type Brand = Schemas["BrandRead"];
export type Attribute = Schemas["AttributeRead"];
export type Province = Schemas["ProvinceRead"];

export type FilterQuery = NonNullable<
  operations["product_facets_api_v1_products_facets_get"]["parameters"]["query"]
>;
export type ProductQuery = NonNullable<operations["search_products_api_v1_products_get"]["parameters"]["query"]>;
