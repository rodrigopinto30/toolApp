import createClient from "openapi-fetch";

import { believesLoggedIn, refreshSession } from "./refresh";
import type { paths } from "./schema";
import { ensureCsrfToken, errorCode, isUnsafe, send } from "./transport";

const AUTH_PATH = "/api/v1/auth/";
const DEFAULT_TIMEOUT_MS = 15_000;

export function createBrowserFetch({ timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  return async function browserFetch(input: Request): Promise<Response> {
    const original = input.clone();
    let response = await send(input, timeoutMs);

    if (isUnsafe(original) && response.status === 403 && (await errorCode(response)) === "csrf_failed") {
      await ensureCsrfToken({ force: true });
      response = await send(original.clone(), timeoutMs);
    }

    if (response.status === 401 && !new URL(original.url).pathname.startsWith(AUTH_PATH)) {
      const code = await errorCode(response);
      if (code === "token_expired" || (code === "unauthorized" && believesLoggedIn())) {
        if ((await refreshSession()) === "refreshed") {
          response = await send(original.clone(), timeoutMs);
        }
      }
    }

    return response;
  };
}

export function createBrowserApi(options: { timeoutMs?: number } = {}) {
  return createClient<paths>({
    baseUrl: typeof window === "undefined" ? "" : window.location.origin,
    fetch: createBrowserFetch(options),
  });
}

export const api = createBrowserApi();
