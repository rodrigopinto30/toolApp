import type { components } from "@/lib/api/schema";

type Schemas = components["schemas"];

export type ProductReview = Schemas["ReviewRead"];
export type ProductReviewPage = Schemas["Page_ReviewRead_"];
export type OwnReview = Schemas["OwnReviewRead"];
export type ReviewProduct = Schemas["ReviewProduct"];
export type ReviewStatus = Schemas["ReviewStatus"];
