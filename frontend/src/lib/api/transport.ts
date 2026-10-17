import { CSRF_COOKIE, CSRF_HEADER, readCookie } from "./cookies";
import { ApiError } from "./errors";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

let csrfRequest: Promise<void> | null = null;

export function apiUrl(path: string): string {
  return new URL(path, window.location.origin).toString();
}

export function isUnsafe(request: Request): boolean {
  return !SAFE_METHODS.has(request.method);
}

export function ensureCsrfToken({ force = false } = {}): Promise<void> {
  if (!force && readCookie(CSRF_COOKIE)) {
    return Promise.resolve();
  }
  csrfRequest ??= fetch(apiUrl("/api/v1/auth/csrf"), { credentials: "same-origin" })
    .then(() => undefined)
    .catch(() => undefined)
    .finally(() => {
      csrfRequest = null;
    });
  return csrfRequest;
}

export async function send(request: Request, timeoutMs: number): Promise<Response> {
  const headers = new Headers(request.headers);
  if (isUnsafe(request)) {
    await ensureCsrfToken();
    const token = readCookie(CSRF_COOKIE);
    if (token) {
      headers.set(CSRF_HEADER, token);
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DOMException("The request timed out", "TimeoutError")),
    timeoutMs,
  );
  const abortFromCaller = () => controller.abort(request.signal.reason);
  request.signal.addEventListener("abort", abortFromCaller, { once: true });

  try {
    return await fetch(new Request(request, { headers, credentials: "same-origin" }), {
      signal: controller.signal,
    });
  } catch (error) {
    throw ApiError.fromFetchFailure(controller.signal.aborted ? controller.signal.reason : error);
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener("abort", abortFromCaller);
  }
}

export async function errorCode(response: Response): Promise<string | undefined> {
  try {
    const body: unknown = await response.clone().json();
    if (typeof body === "object" && body !== null && "code" in body && typeof body.code === "string") {
      return body.code;
    }
  } catch {
    return undefined;
  }
  return undefined;
}
