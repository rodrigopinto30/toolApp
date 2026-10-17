import { ApiError } from "@/lib/api/errors";

import { makeQueryClient, retryDelay } from "./query-client";

function apiError(status: number, code: string, retryAfter?: number): ApiError {
  return new ApiError({ status, code, message: "", retryAfter });
}

describe("query defaults", () => {
  const { queries, mutations } = makeQueryClient().getDefaultOptions();
  const retry = queries?.retry as (failureCount: number, error: unknown) => boolean;

  it("retries transient failures at most twice", () => {
    expect(retry(0, apiError(503, "service_unavailable"))).toBe(true);
    expect(retry(1, apiError(0, "network_error"))).toBe(true);
    expect(retry(2, apiError(0, "timeout"))).toBe(false);
  });

  it("never retries client errors", () => {
    expect(retry(0, apiError(422, "validation_error"))).toBe(false);
    expect(retry(0, apiError(401, "unauthorized"))).toBe(false);
  });

  it("keeps data fresh for 30 seconds, without refetching on focus, and never retries mutations", () => {
    expect(queries?.staleTime).toBe(30_000);
    expect(queries?.refetchOnWindowFocus).toBe(false);
    expect(mutations?.retry).toBe(false);
  });
});

describe("retryDelay", () => {
  it("waits for Retry-After, with a cap", () => {
    expect(retryDelay(0, apiError(429, "rate_limited", 5))).toBe(5_000);
    expect(retryDelay(0, apiError(429, "rate_limited", 600))).toBe(30_000);
  });

  it("backs off exponentially otherwise", () => {
    expect([0, 1, 2, 10].map((attempt) => retryDelay(attempt, new Error()))).toEqual([
      1_000, 2_000, 4_000, 30_000,
    ]);
  });
});
