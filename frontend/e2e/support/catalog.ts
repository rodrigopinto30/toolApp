import { expect, type APIRequestContext } from "@playwright/test";

import type { CategoryNode, ProductSummary } from "../../src/features/catalog/types";
import type { Currency } from "../../src/lib/currency";
import type { Locale } from "./i18n";

async function json<T>(request: APIRequestContext, path: string, params: Record<string, string>): Promise<T> {
  const response = await request.get(path, { params });
  expect(response.status(), path).toBe(200);
  return response.json();
}

export function categoryTree(request: APIRequestContext, locale: Locale = "es") {
  return json<CategoryNode[]>(request, "/api/v1/categories", { locale });
}

export function featuredProducts(request: APIRequestContext, currency: Currency, locale: Locale = "es") {
  return json<ProductSummary[]>(request, "/api/v1/products/featured", { locale, currency });
}
