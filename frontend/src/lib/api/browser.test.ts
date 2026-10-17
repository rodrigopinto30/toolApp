import { delay, http, HttpResponse } from "msw";

import { clearCookie, setCookie } from "@/test/cookies";
import { server } from "@/test/msw/server";

import { createBrowserApi, createBrowserFetch } from "./browser";
import { CSRF_COOKIE } from "./cookies";
import { unwrap } from "./errors";
import { onSessionExpired, setSessionHint } from "./refresh";

const ORIGIN = "https://localhost";
const browserFetch = createBrowserFetch();

function call(path: string, method = "GET"): Promise<Response> {
  return browserFetch(new Request(`${ORIGIN}${path}`, { method, body: method === "GET" ? null : "{}" }));
}

function expired(): Response {
  return HttpResponse.json({ code: "token_expired", message: "expired" }, { status: 401 });
}

beforeEach(() => {
  clearCookie(CSRF_COOKIE);
  localStorage.clear();
  setSessionHint(() => false);
});

describe("CSRF", () => {
  it("sends the cookie as X-CSRF-Token on unsafe requests only", async () => {
    setCookie(CSRF_COOKIE, "token-1");
    const seen: (string | null)[] = [];
    server.use(
      http.all(`${ORIGIN}/api/v1/me`, ({ request }) => {
        seen.push(request.headers.get("x-csrf-token"));
        return HttpResponse.json({});
      }),
    );

    await call("/api/v1/me", "PATCH");
    await call("/api/v1/me");

    expect(seen).toEqual(["token-1", null]);
  });

  it("fetches the cookie once when concurrent unsafe requests need it", async () => {
    let issued = 0;
    const seen: (string | null)[] = [];
    server.use(
      http.get(`${ORIGIN}/api/v1/auth/csrf`, async () => {
        issued += 1;
        await delay(20);
        setCookie(CSRF_COOKIE, "fresh");
        return new HttpResponse(null, { status: 204 });
      }),
      http.post(`${ORIGIN}/api/v1/shipping/quote`, ({ request }) => {
        seen.push(request.headers.get("x-csrf-token"));
        return HttpResponse.json({});
      }),
    );

    await Promise.all([call("/api/v1/shipping/quote", "POST"), call("/api/v1/shipping/quote", "POST")]);

    expect(issued).toBe(1);
    expect(seen).toEqual(["fresh", "fresh"]);
  });

  it("re-issues the cookie and retries once after csrf_failed", async () => {
    setCookie(CSRF_COOKIE, "stale");
    const seen: (string | null)[] = [];
    server.use(
      http.get(`${ORIGIN}/api/v1/auth/csrf`, () => {
        setCookie(CSRF_COOKIE, "renewed");
        return new HttpResponse(null, { status: 204 });
      }),
      http.patch(`${ORIGIN}/api/v1/me`, ({ request }) => {
        const token = request.headers.get("x-csrf-token");
        seen.push(token);
        return token === "renewed"
          ? HttpResponse.json({})
          : HttpResponse.json({ code: "csrf_failed", message: "x" }, { status: 403 });
      }),
    );

    const response = await call("/api/v1/me", "PATCH");

    expect(response.status).toBe(200);
    expect(seen).toEqual(["stale", "renewed"]);
  });
});

describe("refresh", () => {
  it("refreshes once for concurrent expired tokens and retries with the new CSRF token", async () => {
    setCookie(CSRF_COOKIE, "before");
    let refreshes = 0;
    let refreshCsrf: string | null = null;
    server.use(
      http.post(`${ORIGIN}/api/v1/auth/refresh`, async ({ request }) => {
        refreshes += 1;
        refreshCsrf = request.headers.get("x-csrf-token");
        await delay(20);
        setCookie(CSRF_COOKIE, "after");
        return HttpResponse.json({});
      }),
      http.patch(`${ORIGIN}/api/v1/me`, ({ request }) =>
        request.headers.get("x-csrf-token") === "after" ? HttpResponse.json({ ok: true }) : expired(),
      ),
    );

    const responses = await Promise.all([call("/api/v1/me", "PATCH"), call("/api/v1/me", "PATCH")]);

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(refreshes).toBe(1);
    expect(refreshCsrf).toBe("before");
  });

  it("waits and retries when another tab is refreshing", async () => {
    setCookie(CSRF_COOKIE, "token");
    let calls = 0;
    server.use(
      http.post(`${ORIGIN}/api/v1/auth/refresh`, () =>
        HttpResponse.json({ code: "refresh_in_progress", message: "x" }, { status: 409 }),
      ),
      http.get(`${ORIGIN}/api/v1/me`, () => {
        calls += 1;
        return calls === 1 ? expired() : HttpResponse.json({});
      }),
    );

    expect((await call("/api/v1/me")).status).toBe(200);
  });

  it("ends the session once when the refresh token is rejected", async () => {
    setCookie(CSRF_COOKIE, "token");
    const listener = jest.fn();
    const stop = onSessionExpired(listener);
    server.use(
      http.post(`${ORIGIN}/api/v1/auth/refresh`, () =>
        HttpResponse.json({ code: "unauthorized", message: "x" }, { status: 401 }),
      ),
      http.get(`${ORIGIN}/api/v1/me`, () => expired()),
    );

    const responses = await Promise.all([call("/api/v1/me"), call("/api/v1/me")]);
    stop();

    expect(responses.map((response) => response.status)).toEqual([401, 401]);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("skips the refresh when another tab refreshed a moment ago", async () => {
    localStorage.setItem("toolapp:auth:refreshed-at", String(Date.now()));
    let calls = 0;
    server.use(
      http.get(`${ORIGIN}/api/v1/me`, () => {
        calls += 1;
        return calls === 1 ? expired() : HttpResponse.json({});
      }),
    );

    expect((await call("/api/v1/me")).status).toBe(200);
  });

  it("never refreshes for the auth endpoints themselves", async () => {
    setCookie(CSRF_COOKIE, "token");
    server.use(http.post(`${ORIGIN}/api/v1/auth/login`, () => expired()));

    expect((await call("/api/v1/auth/login", "POST")).status).toBe(401);
  });

  it("refreshes an unauthorized answer only while the user is believed to be logged in", async () => {
    setCookie(CSRF_COOKIE, "token");
    let refreshes = 0;
    server.use(
      http.post(`${ORIGIN}/api/v1/auth/refresh`, () => {
        refreshes += 1;
        return HttpResponse.json({ code: "unauthorized", message: "x" }, { status: 401 });
      }),
      http.get(`${ORIGIN}/api/v1/me`, () =>
        HttpResponse.json({ code: "unauthorized", message: "x" }, { status: 401 }),
      ),
    );

    await call("/api/v1/me");
    setSessionHint(() => true);
    await call("/api/v1/me");

    expect(refreshes).toBe(1);
  });
});

describe("errors", () => {
  const api = createBrowserApi();

  it("normalizes the HTML 429 of nginx", async () => {
    server.use(
      http.get(
        `${ORIGIN}/api/v1/brands`,
        () =>
          new HttpResponse("<html>429</html>", {
            status: 429,
            headers: { "content-type": "text/html", "retry-after": "60" },
          }),
      ),
    );

    await expect(unwrap(api.GET("/api/v1/brands"))).rejects.toMatchObject({
      status: 429,
      code: "rate_limited",
      retryAfter: 60,
    });
  });

  it("turns network failures into ApiError", async () => {
    server.use(http.get(`${ORIGIN}/api/v1/brands`, () => HttpResponse.error()));

    await expect(api.GET("/api/v1/brands")).rejects.toMatchObject({ code: "network_error" });
  });

  it("aborts slow requests", async () => {
    const slowApi = createBrowserApi({ timeoutMs: 50 });
    server.use(
      http.get(`${ORIGIN}/api/v1/brands`, async () => {
        await delay(1_000);
        return HttpResponse.json([]);
      }),
    );

    await expect(slowApi.GET("/api/v1/brands")).rejects.toMatchObject({ code: "timeout" });
  });
});
