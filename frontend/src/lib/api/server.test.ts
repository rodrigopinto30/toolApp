import { http, HttpResponse } from "msw";

import { server } from "@/test/msw/server";

import { unwrap } from "./errors";
import { publicCache, serverApi } from "./server";

const ORIGIN = "http://backend.test:8000";

beforeAll(() => {
  process.env.INTERNAL_API_ORIGIN = ORIGIN;
  process.env.PUBLIC_URL = "https://localhost:8443";
});

it("calls the internal API origin without forwarding user cookies", async () => {
  let cookie: string | null = "not checked";
  server.use(
    http.get(`${ORIGIN}/api/v1/brands`, ({ request }) => {
      cookie = request.headers.get("cookie");
      return HttpResponse.json([{ slug: "bosch", name: "Bosch", logo_url: null }]);
    }),
  );

  const brands = await unwrap(serverApi().GET("/api/v1/brands", publicCache(["catalog"])));

  expect(brands).toEqual([{ slug: "bosch", name: "Bosch", logo_url: null }]);
  expect(cookie).toBeNull();
});

it("turns API errors into ApiError", async () => {
  server.use(
    http.get(`${ORIGIN}/api/v1/products/:slug`, () =>
      HttpResponse.json({ code: "not_found", message: "Resource not found.", request_id: "r1" }, { status: 404 }),
    ),
  );

  await expect(
    unwrap(serverApi().GET("/api/v1/products/{slug}", { params: { path: { slug: "nope" } } })),
  ).rejects.toMatchObject({ status: 404, code: "not_found", requestId: "r1" });
});

it("hands the cache options to Next's fetch together with the timeout", async () => {
  server.use(http.get(`${ORIGIN}/api/v1/brands`, () => HttpResponse.json([])));
  const fetchSpy = jest.spyOn(globalThis, "fetch");

  await unwrap(serverApi().GET("/api/v1/brands", publicCache(["catalog"])));

  const [, init] = fetchSpy.mock.calls[0];
  expect(init?.next).toEqual({ revalidate: 60, tags: ["catalog"] });
  expect(init?.signal).toBeDefined();
  fetchSpy.mockRestore();
});

it("caches public calls for 60 seconds with tags", () => {
  expect(publicCache(["catalog", "pricing"])).toEqual({
    next: { revalidate: 60, tags: ["catalog", "pricing"] },
  });
});
