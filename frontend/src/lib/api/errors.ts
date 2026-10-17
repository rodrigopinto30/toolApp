type ErrorBody = {
  code?: unknown;
  message?: unknown;
  request_id?: unknown;
  details?: unknown;
};

const RETRYABLE_CODES = new Set(["network_error", "timeout", "rate_limited", "service_unavailable"]);

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | undefined;
  readonly details: unknown;
  readonly retryAfter: number | undefined;

  constructor(options: {
    status: number;
    code: string;
    message: string;
    requestId?: string;
    details?: unknown;
    retryAfter?: number;
  }) {
    super(options.message);
    this.name = "ApiError";
    this.status = options.status;
    this.code = options.code;
    this.requestId = options.requestId;
    this.details = options.details;
    this.retryAfter = options.retryAfter;
  }

  static fromResponse(response: Response, body: unknown): ApiError {
    const json = typeof body === "object" && body !== null ? (body as ErrorBody) : {};
    const retryAfter = Number(response.headers.get("retry-after"));
    return new ApiError({
      status: response.status,
      code: typeof json.code === "string" ? json.code : fallbackCode(response.status),
      message: typeof json.message === "string" ? json.message : response.statusText || "Request failed",
      requestId:
        typeof json.request_id === "string"
          ? json.request_id
          : (response.headers.get("x-request-id") ?? undefined),
      details: json.details,
      retryAfter: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
    });
  }

  static fromFetchFailure(error: unknown): ApiError {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    return new ApiError({
      status: 0,
      code: timedOut ? "timeout" : "network_error",
      message: timedOut ? "The request timed out" : "The network request failed",
    });
  }
}

function fallbackCode(status: number): string {
  if (status === 429) {
    return "rate_limited";
  }
  if (status >= 502 && status <= 504) {
    return "service_unavailable";
  }
  return "http_error";
}

export function isRetryable(error: unknown): boolean {
  return error instanceof ApiError && (RETRYABLE_CODES.has(error.code) || error.status >= 500);
}

export async function unwrap<T>(
  result: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  const { data, error, response } = await result;
  if (!response.ok) {
    throw ApiError.fromResponse(response, error);
  }
  return data as T;
}
