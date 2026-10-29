import { http, HttpResponse } from "msw";

import { server } from "@/test/msw/server";

import { findCategory, getAllProductSlugs, getProduct, listingCache } from "./api";
import type { CategoryNode } from "./types";

const ORIGIN = "http://backend.test:8000";

beforeAll(() => {
  process.env.INTERNAL_API_ORIGIN = ORIGIN;
  process.env.PUBLIC_URL = "https://localhost:8443";
});

describe("listingCache", () => {
  it("caches listings without filters, whose keys are bounded", () => {
    expect(listingCache({ locale: "es", currency: "ARS", category: "drills", page: 2 })).toEqual({
      next: { revalidate: 60, tags: ["catalog", "pricing"] },
    });
  });

  it.each([{ q: "taladro" }, { brand: ["bosch"] }, { "attr[]": ["voltage:18v"] }, { min_price: "10" }, { in_stock: true }, { sort: "name" as const }])(
    "never caches a filtered listing (%o)",
    (filter) => {
      expect(listingCache({ locale: "es", currency: "ARS", ...filter })).toEqual({ cache: "no-store" });
    },
  );
});

describe("findCategory", () => {
  const tree: CategoryNode[] = [
    {
      slug: "power-tools",
      name: "Herramientas eléctricas",
      description: null,
      image_url: null,
      children: [{ slug: "drills", name: "Taladros", description: null, image_url: null, children: [] }],
    },
  ];

  it("returns the category with the path from the top level", () => {
    expect(findCategory(tree, "drills")?.path.map((node) => node.slug)).toEqual(["power-tools", "drills"]);
  });

  it("returns null for an unknown slug", () => {
    expect(findCategory(tree, "saws")).toBeNull();
  });
});

describe("getProduct", () => {
  it("returns null when the product does not exist", async () => {
    server.use(
      http.get(`${ORIGIN}/api/v1/products/:slug`, () =>
        HttpResponse.json({ code: "not_found", message: "Product not found.", request_id: "r1" }, { status: 404 }),
      ),
    );

    await expect(getProduct("nope", "es", "ARS")).resolves.toBeNull();
  });

  it("lets other errors through", async () => {
    server.use(http.get(`${ORIGIN}/api/v1/products/:slug`, () => new HttpResponse(null, { status: 503 })));

    await expect(getProduct("drill", "es", "ARS")).rejects.toMatchObject({ code: "service_unavailable" });
  });
});

describe("getAllProductSlugs", () => {
  it("walks every page of the catalog", async () => {
    const pages: string[] = [];
    server.use(
      http.get(`${ORIGIN}/api/v1/products`, ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get("page"));
        pages.push(new URL(request.url).search);
        return HttpResponse.json({ items: [{ slug: `product-${page}` }], page, size: 48, total: 2, pages: 2 });
      }),
    );

    await expect(getAllProductSlugs("es")).resolves.toEqual(["product-1", "product-2"]);
    expect(pages).toEqual(["?locale=es&currency=USD&size=48&page=1", "?locale=es&currency=USD&size=48&page=2"]);
  });
});
