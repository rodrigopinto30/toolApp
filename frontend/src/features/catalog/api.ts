import "server-only";

import type { Locale } from "@/i18n/routing";
import { ApiError, unwrap } from "@/lib/api/errors";
import { publicCache, serverApi } from "@/lib/api/server";
import type { Currency } from "@/lib/currency";

import type { CategoryNode, FilterQuery, ProductQuery } from "./types";

const CATALOG = publicCache(["catalog"]);
const PRICED = publicCache(["catalog", "pricing"]);
const SHIPPING = publicCache(["shipping"]);
const NO_STORE = { cache: "no-store" } as const;
const FILTER_KEYS = ["q", "brand", "attr[]", "min_price", "max_price", "in_stock", "sort"] as const;
const ALL_PRODUCTS_PAGE_SIZE = 48;

export function listingCache(query: FilterQuery | ProductQuery) {
  return FILTER_KEYS.some((key) => key in query) ? NO_STORE : PRICED;
}

export function getCategoryTree(locale: Locale) {
  return unwrap(serverApi().GET("/api/v1/categories", { params: { query: { locale } }, ...CATALOG }));
}

export function getBrands() {
  return unwrap(serverApi().GET("/api/v1/brands", CATALOG));
}

export function getAttributes(locale: Locale) {
  return unwrap(serverApi().GET("/api/v1/attributes", { params: { query: { locale } }, ...CATALOG }));
}

export function getFeatured(locale: Locale, currency: Currency) {
  return unwrap(
    serverApi().GET("/api/v1/products/featured", { params: { query: { locale, currency } }, ...PRICED }),
  );
}

export function searchProducts(query: ProductQuery) {
  return unwrap(serverApi().GET("/api/v1/products", { params: { query }, ...listingCache(query) }));
}

export async function getAllProductSlugs(locale: Locale): Promise<string[]> {
  const query = { locale, currency: "USD" as const, size: ALL_PRODUCTS_PAGE_SIZE };
  const first = await searchProducts({ ...query, page: 1 });
  const rest = await Promise.all(
    Array.from({ length: first.pages - 1 }, (_, index) => searchProducts({ ...query, page: index + 2 })),
  );
  return [first, ...rest].flatMap((page) => page.items.map((item) => item.slug));
}

export function getFacets(query: FilterQuery) {
  return unwrap(serverApi().GET("/api/v1/products/facets", { params: { query }, ...listingCache(query) }));
}

export async function getProduct(slug: string, locale: Locale, currency: Currency) {
  try {
    return await unwrap(
      serverApi().GET("/api/v1/products/{slug}", {
        params: { path: { slug }, query: { locale, currency } },
        ...PRICED,
      }),
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export function getPickupPoints() {
  return unwrap(serverApi().GET("/api/v1/pickup-points", SHIPPING));
}

export function getProvinces(locale: Locale) {
  return unwrap(serverApi().GET("/api/v1/provinces", { params: { query: { locale } }, ...SHIPPING }));
}

export function findCategory(
  tree: CategoryNode[],
  slug: string,
  path: CategoryNode[] = [],
): { category: CategoryNode; path: CategoryNode[] } | null {
  for (const node of tree) {
    const nodePath = [...path, node];
    if (node.slug === slug) {
      return { category: node, path: nodePath };
    }
    const found = findCategory(node.children ?? [], slug, nodePath);
    if (found) {
      return found;
    }
  }
  return null;
}
