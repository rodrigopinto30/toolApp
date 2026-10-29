import { serializeJsonLd } from "@/components/seo/json-ld";

import { breadcrumbJsonLd, productJsonLd } from "./structured-data";
import type { ProductDetail } from "./types";

const ORIGIN = "https://shop.example";

const PRODUCT: ProductDetail = {
  slug: "stanley-tape-measure",
  name: "Cinta métrica",
  short_description: "Cinta <b>resistente</b>.",
  brand: { slug: "stanley", name: "Stanley" },
  image: null,
  price_from: { amount: "11455", currency: "ARS" },
  price_varies: true,
  compare_at: null,
  stock_status: "in_stock",
  rating_avg: "0.00",
  rating_count: 0,
  description: "Cinta métrica.",
  specs: {},
  category_path: [{ slug: "measuring", name: "Medición" }],
  images: [{ url: "/media/products/tape.webp", alt: "Cinta" }],
  variants: [
    { id: 1, sku: "STA-TM-5M", price: { amount: "11455", currency: "ARS" }, compare_at: null, stock_status: "out_of_stock", attributes: [] },
    { id: 2, sku: "STA-TM-8M", price: { amount: "15805", currency: "ARS" }, compare_at: null, stock_status: "in_stock", attributes: [] },
  ],
};

it("describes the product with an aggregate offer over its variants", () => {
  expect(productJsonLd(PRODUCT, `${ORIGIN}/es/products/stanley-tape-measure`, ORIGIN)).toEqual({
    "@context": "https://schema.org",
    "@type": "Product",
    name: "Cinta métrica",
    description: "Cinta <b>resistente</b>.",
    url: `${ORIGIN}/es/products/stanley-tape-measure`,
    brand: { "@type": "Brand", name: "Stanley" },
    image: [`${ORIGIN}/media/products/tape.webp`],
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "ARS",
      lowPrice: "11455",
      highPrice: "15805",
      offerCount: 2,
      availability: "https://schema.org/InStock",
    },
  });
});

it("adds the SKU of a single variant and the rating once there are reviews", () => {
  const single = { ...PRODUCT, variants: [PRODUCT.variants[0]], rating_avg: "4.50", rating_count: 3 };

  expect(productJsonLd(single, ORIGIN, ORIGIN)).toMatchObject({
    sku: "STA-TM-5M",
    offers: { availability: "https://schema.org/OutOfStock" },
    aggregateRating: { "@type": "AggregateRating", ratingValue: "4.50", reviewCount: 3 },
  });
});

it("lists the breadcrumb in order with absolute URLs", () => {
  expect(
    breadcrumbJsonLd(ORIGIN, "es", [
      { name: "Inicio", href: "/" },
      { name: "Medición", href: "/categories/measuring" },
    ]),
  ).toEqual({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: `${ORIGIN}/es` },
      { "@type": "ListItem", position: 2, name: "Medición", item: `${ORIGIN}/es/categories/measuring` },
    ],
  });
});

it("escapes markup so the data can never close the script element", () => {
  const serialized = serializeJsonLd(productJsonLd({ ...PRODUCT, name: "</script><script>alert(1)</script>" }, ORIGIN, ORIGIN));

  expect(serialized).not.toContain("</script>");
  expect(JSON.parse(serialized).name).toBe("</script><script>alert(1)</script>");
});
