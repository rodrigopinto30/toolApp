import { expect, type APIRequestContext } from "@playwright/test";

import type { CategoryNode, ProductFacets, ProductPage, ProductSummary } from "../../src/features/catalog/types";
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
