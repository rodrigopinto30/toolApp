import { categoryPath, productPath } from "../../src/features/catalog/paths";
import { formatMoney } from "../../src/lib/money";
import { CategoryPage } from "../pages/category-page";
import { ProductPage } from "../pages/product-page";
import {
  largestCategory,
  productDetail,
  productWithPriceVariants,
  provinces,
  searchProducts,
  shippingQuote,
} from "../support/catalog";
import { expect, test } from "../support/fixtures";
import { messages } from "../support/i18n";
import { BASE_URL } from "../support/stack";

const t = messages.es;

test("a product card opens the product page with its breadcrumbs", async ({ page, request }) => {
  const category = await largestCategory(request);
  const [first] = (await searchProducts(request, { category: category.slug })).items;
  const product = await productDetail(request, first.slug);
  const listing = new CategoryPage(page, category.slug);
  const productPage = new ProductPage(page, product.slug);

  await listing.goto();
  await listing.products.getByRole("link", { name: product.name, exact: true }).click();

  await expect(page).toHaveURL(`${BASE_URL}${productPage.url}`);
  await expect(productPage.heading).toHaveText(product.name);
  for (const crumb of product.category_path) {
    await expect(productPage.breadcrumbs.getByRole("link", { name: crumb.name })).toHaveAttribute(
      "href",
      `/es${categoryPath(crumb.slug)}`,
    );
  }
});

test("the variant selector updates price, stock and SKU and keeps the choice in the URL", async ({ page, request }) => {
  const product = await productWithPriceVariants(request);
  const [, other] = product.variants;
  const label = other.attributes.map((attribute) => attribute.value).join(" ");
  const productPage = new ProductPage(page, product.slug);

  await productPage.goto();
  await productPage.chooseVariant(label);

  await expect(productPage.variant(label)).toBeChecked();
  await expect(productPage.sku).toHaveText(`SKU: ${other.sku}`);
  await expect(page.getByRole("main")).toContainText(formatMoney(other.price, "es"));
  await expect(page).toHaveURL(`${BASE_URL}${productPage.url}?variant=${other.sku}`);

  await page.reload();
  await expect(productPage.sku).toHaveText(`SKU: ${other.sku}`);
});

test("the shipping quote works for a province and for store pickup", async ({ page, request }) => {
  const product = await productWithPriceVariants(request);
  const [province] = await provinces(request);
  const variant = product.variants.find((candidate) => candidate.stock_status !== "out_of_stock") ?? product.variants[0];
  const [home, pickup] = await Promise.all([
    shippingQuote(request, {
      delivery_method: "shipping",
      province_code: province.code,
      items: [{ variant_id: variant.id, quantity: 2 }],
      currency: "ARS",
    }),
    shippingQuote(request, { delivery_method: "pickup", items: [{ variant_id: variant.id, quantity: 2 }], currency: "ARS" }),
  ]);
  const productPage = new ProductPage(page, product.slug);

  await productPage.goto();
  await productPage.chooseProvince(province.name);
  await productPage.quantity.fill("2");
  await productPage.estimate.click();
  await expect(productPage.quote).toContainText(
    home.is_free ? t.Product.shipping.free : formatMoney(home.cost, "es"),
  );

  await productPage.chooseDelivery("pickup");
  await expect(productPage.province).toBeHidden();
  await productPage.estimate.click();
  await expect(productPage.quote).toContainText(pickup.pickup_points[0].name);
});

test("unknown or malformed products answer 404", async ({ request }) => {
  for (const slug of ["no-such-product", "Bad_Slug"]) {
    const response = await request.get(`/es${productPath(slug)}`);
    expect(response.status(), slug).toBe(404);
  }
});

test("the product page declares its canonical URL and its structured data", async ({ request }) => {
  const product = await productWithPriceVariants(request);
  const path = productPath(product.slug);

  const html = await (await request.get(`/es${path}?variant=${product.variants[1].sku}`)).text();
  const structured = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map(([, data]) =>
    JSON.parse(data),
  );

  expect(html).toContain(`<link rel="canonical" href="${BASE_URL}/es${path}"/>`);
  expect(structured).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        "@type": "Product",
        name: product.name,
        url: `${BASE_URL}/es${path}`,
        offers: expect.objectContaining({ lowPrice: product.price_from.amount, offerCount: product.variants.length }),
      }),
      expect.objectContaining({ "@type": "BreadcrumbList" }),
    ]),
  );
});
