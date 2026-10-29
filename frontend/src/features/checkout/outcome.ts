import { ApiError } from "@/lib/api/errors";

import type { CheckoutPreview } from "./types";

export type Failure =
  | { kind: "rejected"; orderNumber: string }
  | { kind: "totalChanged"; preview: CheckoutPreview }
  | { kind: "cart" }
  | { kind: "coupon" }
  | { kind: "verify" }
  | { kind: "message" };

const CART_CODES = new Set(["insufficient_stock", "cart_has_issues", "cart_empty"]);

function detail(details: unknown, key: string): unknown {
  return typeof details === "object" && details !== null && key in details
    ? (details as Record<string, unknown>)[key]
    : undefined;
}

export function isCouponError(error: unknown): boolean {
  return error instanceof ApiError && error.code.startsWith("coupon_");
}

export function failureOf(error: unknown): Failure {
  if (!(error instanceof ApiError)) {
    return { kind: "message" };
  }
  const orderNumber = detail(error.details, "order_number");
  if (error.code === "payment_rejected" && typeof orderNumber === "string") {
    return { kind: "rejected", orderNumber };
  }
  const preview = detail(error.details, "preview");
  if (error.code === "total_changed" && typeof preview === "object" && preview !== null) {
    return { kind: "totalChanged", preview: preview as CheckoutPreview };
  }
  if (CART_CODES.has(error.code)) {
    return { kind: "cart" };
  }
  if (isCouponError(error)) {
    return { kind: "coupon" };
  }
  return error.code === "email_not_verified" ? { kind: "verify" } : { kind: "message" };
}
