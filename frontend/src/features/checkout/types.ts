import type { components } from "@/lib/api/schema";

type Schemas = components["schemas"];

export type CheckoutPreviewRequest = Schemas["CheckoutPreviewRequest"];
export type CheckoutPreview = Schemas["CheckoutPreviewRead"];
export type CheckoutRequest = Schemas["CheckoutRequest"];
export type CheckoutBody = Omit<CheckoutRequest, "payment">;
export type CardPayment = Schemas["CardPayment"];
export type Order = Schemas["OrderRead"];
export type DeliveryMethod = Schemas["DeliveryMethod"];
