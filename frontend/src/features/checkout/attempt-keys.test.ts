import { ApiError } from "@/lib/api/errors";

import { createAttemptKeys, keepsAttempt } from "./attempt-keys";

function keys() {
  let next = 0;
  return createAttemptKeys(() => `key-${++next}`);
}

it("keeps one key per attempt until it settles or the body changes", () => {
  const attempts = keys();

  expect(attempts.keyFor("a")).toBe("key-1");
  expect(attempts.keyFor("a")).toBe("key-1");
  expect(attempts.keyFor("b")).toBe("key-2");
  attempts.settle();
  expect(attempts.keyFor("b")).toBe("key-3");
});

it.each([
  ["network_error", 0, true],
  ["timeout", 0, true],
  ["rate_limited", 429, true],
  ["payment_unavailable", 503, true],
  ["payment_rejected", 402, false],
  ["total_changed", 409, false],
  ["coupon_expired", 422, false],
])("a %s answer keeps the attempt: %s", (code, status, kept) => {
  expect(keepsAttempt(new ApiError({ status: Number(status), code: String(code), message: "" }))).toBe(kept);
});
