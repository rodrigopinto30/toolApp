import type { JsonLdData } from "@/components/seo/json-ld";
import type { Locale } from "@/i18n/locales";

import { localizedUrl } from "./seo";
import type { ProductDetail } from "./types";

const SCHEMA = "https://schema.org";

export type BreadcrumbEntry = { name: string; href: string };

export function breadcrumbJsonLd(origin: string, locale: Locale, entries: BreadcrumbEntry[]): JsonLdData {
  return {
    "@context": SCHEMA,
    "@type": "BreadcrumbList",
    itemListElement: entries.map((entry, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: entry.name,
      item: localizedUrl(origin, locale, entry.href),
    })),
  };
}

export function productJsonLd(product: ProductDetail, url: string, origin: string): JsonLdData {
  const highest = product.variants.reduce((top, variant) =>
    Number(variant.price.amount) > Number(top.price.amount) ? variant : top,
  );
  const available = product.variants.some((variant) => variant.stock_status !== "out_of_stock");
  return {
    "@context": SCHEMA,
    "@type": "Product",
    name: product.name,
    description: product.short_description,
    url,
    ...(product.variants.length === 1 && { sku: product.variants[0].sku }),
    ...(product.brand && { brand: { "@type": "Brand", name: product.brand.name } }),
    ...(product.images.length > 0 && { image: product.images.map((image) => new URL(image.url, origin).href) }),
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: product.price_from.currency,
      lowPrice: product.price_from.amount,
      highPrice: highest.price.amount,
      offerCount: product.variants.length,
      availability: `${SCHEMA}/${available ? "InStock" : "OutOfStock"}`,
    },
    ...(product.rating_count > 0 && {
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: product.rating_avg,
        reviewCount: product.rating_count,
      },
    }),
  };
}
