import { expect, type APIRequestContext } from "@playwright/test";

import type {
  CategoryNode,
  ProductDetail,
  ProductFacets,
  ProductPage,
  ProductSummary,
  Province,
  ShippingQuoteRequest,
  ShippingQuoteResult,
} from "../../src/features/catalog/types";
import type { Currency } from "../../src/lib/currency";
import type { Locale } from "./i18n";

type Params = Record<string, string | string[]>;

async function json<T>(request: APIRequestContext, path: string, params: Params): Promise<T> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const item of [value].flat()) {
      query.append(key, item);
    }
  }
  const response = await request.get(`${path}?${query}`);
  expect(response.status(), path).toBe(200);
  return response.json();
}

export function categoryTree(request: APIRequestContext, locale: Locale = "es") {
  return json<CategoryNode[]>(request, "/api/v1/categories", { locale });
}

export function featuredProducts(request: APIRequestContext, currency: Currency, locale: Locale = "es") {
  return json<ProductSummary[]>(request, "/api/v1/products/featured", { locale, currency });
}

export function searchProducts(request: APIRequestContext, params: Params) {
  return json<ProductPage>(request, "/api/v1/products", { locale: "es", currency: "ARS", ...params });
}

export function productFacets(request: APIRequestContext, params: Params) {
  return json<ProductFacets>(request, "/api/v1/products/facets", { locale: "es", currency: "ARS", ...params });
}

export async function largestCategory(request: APIRequestContext): Promise<CategoryNode> {
  const tree = await categoryTree(request);
  const totals = await Promise.all(
    tree.map(async (category) => (await searchProducts(request, { category: category.slug })).total),
  );
  return tree[totals.indexOf(Math.max(...totals))];
}

export function productDetail(request: APIRequestContext, slug: string, currency = "ARS") {
  return json<ProductDetail>(request, `/api/v1/products/${slug}`, { locale: "es", currency });
}

export function provinces(request: APIRequestContext) {
  return json<Province[]>(request, "/api/v1/provinces", { locale: "es" });
}

export async function shippingQuote(request: APIRequestContext, body: ShippingQuoteRequest): Promise<ShippingQuoteResult> {
  const response = await request.post("/api/v1/shipping/quote?locale=es", { data: body });
  expect(response.status(), "shipping quote").toBe(200);
  return response.json();
}

export async function productWithPriceVariants(request: APIRequestContext): Promise<ProductDetail> {
  const { items } = await searchProducts(request, { size: "48" });
  const card = items.find((item) => item.price_varies);
  if (!card) {
    throw new Error("The seed needs a product whose variants have different prices");
  }
  return productDetail(request, card.slug);
}

export function flattenCategories(nodes: CategoryNode[]): CategoryNode[] {
  return nodes.flatMap((node) => [node, ...flattenCategories(node.children ?? [])]);
}

export async function allProductSlugs(request: APIRequestContext): Promise<string[]> {
  const slugs: string[] = [];
  for (let page = 1, pages = 1; page <= pages; page++) {
    const result = await searchProducts(request, { currency: "USD", size: "48", page: String(page) });
    pages = result.pages;
    slugs.push(...result.items.map((item) => item.slug));
  }
  return slugs;
}
