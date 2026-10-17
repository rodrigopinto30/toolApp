import { ApiError, isRetryable, unwrap } from "./errors";

function response(status: number, headers: Record<string, string> = {}): Response {
  return new Response(null, { status, headers });
}

describe("ApiError.fromResponse", () => {
  it("reads the uniform error body of the API", () => {
    const error = ApiError.fromResponse(response(422), {
      code: "validation_error",
      message: "Invalid request.",
      request_id: "abc",
      details: [{ loc: ["body", "email"] }],
    });

    expect(error).toMatchObject({
      status: 422,
      code: "validation_error",
      message: "Invalid request.",
      requestId: "abc",
      details: [{ loc: ["body", "email"] }],
    });
  });

  it.each([
    [429, "rate_limited"],
    [502, "service_unavailable"],
    [504, "service_unavailable"],
    [418, "http_error"],
  ])("gives a code to non-JSON answers (%i)", (status, code) => {
    expect(ApiError.fromResponse(response(status, { "x-request-id": "r1" }), "<html></html>")).toMatchObject({
      status,
      code,
      requestId: "r1",
    });
  });

  it("keeps Retry-After in seconds", () => {
    expect(ApiError.fromResponse(response(429, { "retry-after": "60" }), "").retryAfter).toBe(60);
    expect(ApiError.fromResponse(response(429, { "retry-after": "soon" }), "").retryAfter).toBeUndefined();
  });
});

describe("ApiError.fromFetchFailure", () => {
  it("tells timeouts from network failures", () => {
    expect(ApiError.fromFetchFailure(new DOMException("x", "TimeoutError")).code).toBe("timeout");
    expect(ApiError.fromFetchFailure(new TypeError("Failed to fetch")).code).toBe("network_error");
  });
});

describe("isRetryable", () => {
  it.each([
    ["network_error", 0, true],
    ["timeout", 0, true],
    ["rate_limited", 429, true],
    ["service_unavailable", 503, true],
    ["internal_error", 500, true],
    ["validation_error", 422, false],
    ["unauthorized", 401, false],
  ])("%s → %s", (code, status, expected) => {
    expect(isRetryable(new ApiError({ status, code, message: "" }))).toBe(expected);
  });

  it("ignores errors that do not come from the API", () => {
    expect(isRetryable(new Error("boom"))).toBe(false);
  });
});

describe("unwrap", () => {
  it("returns the data of a successful call and throws an ApiError otherwise", async () => {
    await expect(unwrap(Promise.resolve({ data: 1, response: response(200) }))).resolves.toBe(1);
    await expect(
      unwrap(Promise.resolve({ error: { code: "not_found", message: "x" }, response: response(404) })),
    ).rejects.toMatchObject({ code: "not_found", status: 404 });
  });
});
