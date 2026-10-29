import { categoryPath, productPath } from "../../src/features/catalog/paths";
import { allProductSlugs, categoryTree, flattenCategories } from "../support/catalog";
import { expect, test } from "../support/fixtures";
import { messages } from "../support/i18n";
import { BASE_URL } from "../support/stack";

const LOCALES = Object.keys(messages);

test("the sitemap lists every page in both languages with its alternates", async ({ request }) => {
  const [tree, productSlugs] = await Promise.all([categoryTree(request), allProductSlugs(request)]);
  const paths = [
    "",
    ...flattenCategories(tree).map((category) => categoryPath(category.slug)),
    ...productSlugs.map(productPath),
  ];

  const response = await request.get("/sitemap.xml");
  const xml = await response.text();
  const locations = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, url]) => url);

  expect(response.headers()["content-type"]).toContain("application/xml");
  expect(locations.sort()).toEqual(paths.flatMap((path) => LOCALES.map((locale) => `${BASE_URL}/${locale}${path}`)).sort());
  const product = productPath(productSlugs[0]);
  for (const [hreflang, locale] of [["es", "es"], ["en", "en"], ["x-default", "es"]]) {
    expect(xml).toContain(`<xhtml:link rel="alternate" hreflang="${hreflang}" href="${BASE_URL}/${locale}${product}" />`);
  }
});

test("robots.txt lets crawlers in, keeps them out of the API and points to the sitemap", async ({ request }) => {
  const response = await request.get("/robots.txt");
  const robots = await response.text();

  expect(response.status()).toBe(200);
  expect(robots).toContain("User-Agent: *");
  expect(robots).toContain("Allow: /");
  expect(robots).toContain("Disallow: /api/");
  expect(robots).toContain(`Sitemap: ${BASE_URL}/sitemap.xml`);
});
