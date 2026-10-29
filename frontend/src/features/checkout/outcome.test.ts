import { ApiError } from "@/lib/api/errors";

import { failureOf } from "./outcome";

function error(code: string, details?: unknown) {
  return new ApiError({ status: 409, code, message: "", details });
}

it("classifies every checkout failure", () => {
  const preview = { total: { amount: "10", currency: "USD" } };

  expect(failureOf(error("payment_rejected", { order_number: "TA-2026-000001" }))).toEqual({
    kind: "rejected",
    orderNumber: "TA-2026-000001",
  });
  expect(failureOf(error("total_changed", { preview }))).toEqual({ kind: "totalChanged", preview });
  expect(["insufficient_stock", "cart_has_issues", "cart_empty"].map((code) => failureOf(error(code)).kind)).toEqual([
    "cart",
    "cart",
    "cart",
  ]);
  expect(failureOf(error("coupon_expired")).kind).toBe("coupon");
  expect(failureOf(error("email_not_verified")).kind).toBe("verify");
  expect(failureOf(error("payment_unavailable")).kind).toBe("message");
  expect(failureOf(new Error("boom")).kind).toBe("message");
});
