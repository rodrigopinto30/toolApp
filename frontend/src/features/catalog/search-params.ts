import {
  createLoader,
  createParser,
  createSerializer,
  parseAsBoolean,
  parseAsNativeArrayOf,
  parseAsStringLiteral,
  type inferParserType,
} from "nuqs/server";

import type { Locale } from "@/i18n/routing";
import type { Currency } from "@/lib/currency";

import { isSlug } from "./slug";
import type { Attribute, Brand, FilterQuery, ProductQuery, ProductSort } from "./types";

export const PRODUCT_SORTS = ["relevance", "newest", "price_asc", "price_desc", "name"] as const satisfies readonly ProductSort[];
export const QUERY_MIN_LENGTH = 2;
const QUERY_MAX_LENGTH = 100;
const ATTRIBUTE_PATTERN = /^[a-z0-9_]+:[a-z0-9-]+$/;
const ATTRIBUTE_MAX_LENGTH = 100;
const PRICE_PATTERN = /^\d{1,12}(?:\.\d{1,2})?$/;
const MAX_VALUES = 20;
const MAX_PAGE = 1000;

function parseAsMatching(accept: (value: string) => boolean) {
  return createParser({
    parse: (value: string) => (accept(value) ? value : null),
    serialize: (value: string) => value,
  });
}

const parseAsQuery = createParser({
  parse: (value: string) => value.trim().slice(0, QUERY_MAX_LENGTH) || null,
  serialize: (value: string) => value,
});

const parseAsPage = createParser({
  parse: (value: string) => {
    const page = Number(value);
    return Number.isInteger(page) && page >= 1 && page <= MAX_PAGE ? page : null;
  },
  serialize: (page: number) => String(page),
});

const parseAsPrice = parseAsMatching((value) => PRICE_PATTERN.test(value));

export const catalogSearchParams = {
  q: parseAsQuery,
  brand: parseAsNativeArrayOf(parseAsMatching(isSlug)),
  attr: parseAsNativeArrayOf(
    parseAsMatching((value) => value.length <= ATTRIBUTE_MAX_LENGTH && ATTRIBUTE_PATTERN.test(value)),
  ),
  min: parseAsPrice,
  max: parseAsPrice,
  stock: parseAsBoolean.withDefault(false),
  sort: parseAsStringLiteral(PRODUCT_SORTS),
  page: parseAsPage.withDefault(1),
};

export type CatalogSearchState = inferParserType<typeof catalogSearchParams>;

export const loadCatalogSearchParams = createLoader(catalogSearchParams);
export const serializeCatalogSearchParams = createSerializer(catalogSearchParams);

export type KnownFilters = {
  brands: ReadonlySet<string>;
  attributes: ReadonlySet<string>;
};

export type CatalogContext = {
  locale: Locale;
  currency: Currency;
  known: KnownFilters;
  category?: string;
};

export function knownFilters(brands: Brand[], attributes: Attribute[]): KnownFilters {
  return {
    brands: new Set(brands.map((brand) => brand.slug)),
    attributes: new Set(
      attributes.flatMap((attribute) => attribute.values.map((value) => `${attribute.code}:${value.slug}`)),
    ),
  };
}

function known(values: string[], accepted: ReadonlySet<string>): string[] {
  return [...new Set(values)].filter((value) => accepted.has(value)).slice(0, MAX_VALUES);
}

export function toFilterQuery(state: CatalogSearchState, context: CatalogContext): FilterQuery {
  const query: FilterQuery = { locale: context.locale, currency: context.currency };
  const brands = known(state.brand, context.known.brands);
  const attributes = known(state.attr, context.known.attributes);
  const reversedPrices = state.min !== null && state.max !== null && Number(state.min) > Number(state.max);

  if (context.category) {
    query.category = context.category;
  }
  if (state.q && state.q.length >= QUERY_MIN_LENGTH) {
    query.q = state.q;
  }
  if (brands.length) {
    query.brand = brands;
  }
  if (attributes.length) {
    query["attr[]"] = attributes;
  }
  if (state.min !== null && !reversedPrices) {
    query.min_price = state.min;
  }
  if (state.max !== null && !reversedPrices) {
    query.max_price = state.max;
  }
  if (state.stock) {
    query.in_stock = true;
  }
  return query;
}

export function toProductQuery(state: CatalogSearchState, context: CatalogContext): ProductQuery {
  const query: ProductQuery = { ...toFilterQuery(state, context), page: state.page };
  if (state.sort) {
    query.sort = state.sort;
  }
  return query;
}
