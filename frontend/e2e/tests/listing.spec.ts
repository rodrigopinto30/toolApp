import { categoryPath } from "../../src/features/catalog/paths";
import { CategoryPage } from "../pages/category-page";
import { categoryTree, largestCategory, productFacets, searchProducts } from "../support/catalog";
import { expect, test } from "../support/fixtures";
import { messages } from "../support/i18n";
import { BASE_URL } from "../support/stack";

const t = messages.es;

function countText(total: number) {
  return total === 0 ? /^Ningún producto$/ : new RegExp(`^${total} productos?$`);
}

test("a category lists its products, its subcategories and the way back", async ({ page, request }) => {
  const parent = (await categoryTree(request)).find((category) => (category.children ?? []).length > 0);
  const child = parent?.children?.[0];
  if (!parent || !child) {
    throw new Error("The seed needs a category with subcategories");
  }
  const results = await searchProducts(request, { category: parent.slug });
  const listing = new CategoryPage(page, parent.slug);

  await listing.goto();
  await expect(listing.heading).toHaveText(parent.name);
  await expect(listing.resultCount).toHaveText(countText(results.total));
  await expect(listing.products).toHaveCount(results.items.length);

  await listing.subcategories.getByRole("link", { name: child.name }).click();
  await expect(page).toHaveURL(`${BASE_URL}/es${categoryPath(child.slug)}`);
  await expect(listing.heading).toHaveText(child.name);
  await expect(listing.breadcrumbs.getByRole("link", { name: parent.name })).toHaveAttribute(
    "href",
    `/es${categoryPath(parent.slug)}`,
  );
});

test("filters update the URL and the results, and going back restores them", async ({ page, request }) => {
  const category = await largestCategory(request);
  const [all, facets] = await Promise.all([
    searchProducts(request, { category: category.slug }),
    productFacets(request, { category: category.slug }),
  ]);
  const brand = facets.brands[0];
  const listing = new CategoryPage(page, category.slug);

  await listing.goto();
  await listing.filterOption(brand.label).check();

  await expect(page).toHaveURL(new RegExp(`\\?brand=${brand.slug}$`));
  await expect(listing.resultCount).toHaveText(countText(brand.count));
  await expect(listing.products).toHaveCount(brand.count);

  await page.goBack();
  await expect(listing.resultCount).toHaveText(countText(all.total));
  await expect(listing.filterOption(brand.label)).not.toBeChecked();
});

test("the sort changes the order of the results", async ({ page, request }) => {
  const category = await largestCategory(request);
  const cheapestFirst = await searchProducts(request, { category: category.slug, sort: "price_asc" });
  const listing = new CategoryPage(page, category.slug);

  await listing.goto();
  await listing.sortBy(t.Listing.sorts.price_asc);

  await expect(page).toHaveURL(/\?sort=price_asc$/);
  await expect(listing.sort).toHaveText(t.Listing.sorts.price_asc);
  await expect(listing.products.first()).toContainText(cheapestFirst.items[0].name);
});

test("an empty result offers to clear the filters", async ({ page, request }) => {
  const category = await largestCategory(request);
  const all = await searchProducts(request, { category: category.slug });
  const listing = new CategoryPage(page, category.slug);

  await page.goto(`${listing.url}?min=999999999`);
  await expect(listing.emptyState).toBeVisible();
  await expect(listing.resultCount).toHaveText(countText(0));

  await listing.clearFilters.click();
  await expect(page).toHaveURL(`${BASE_URL}${listing.url}`);
  await expect(listing.resultCount).toHaveText(countText(all.total));
});

test("switching the currency drops a price range typed in the other one", async ({ page, request }) => {
  const category = await largestCategory(request);
  const listing = new CategoryPage(page, category.slug);

  await page.goto(`${listing.url}?min=1000&stock=true`);
  await listing.header.chooseCurrency("USD");

  await expect(page).toHaveURL(`${BASE_URL}${listing.url}?stock=true`);
  await expect(listing.header.currency).toHaveText("USD");
});

test.describe("on a small screen", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the filters open in a panel", async ({ page, request }) => {
    const category = await largestCategory(request);
    const brand = (await productFacets(request, { category: category.slug })).brands[0];
    const listing = new CategoryPage(page, category.slug);

    await listing.goto();
    await expect(listing.filters).toBeHidden();
    await listing.filtersButton.click();
    const panel = page.getByRole("dialog", { name: t.Listing.filters });
    await listing.filterOption(brand.label).check();

    await expect(page).toHaveURL(new RegExp(`\\?brand=${brand.slug}$`));
    await panel.getByRole("button", { name: t.Listing.closeFilters }).click();
    await expect(listing.resultCount).toHaveText(countText(brand.count));
  });
});

test("the header search lists the matching products", async ({ page, request, homePage, searchPage }) => {
  const results = await searchProducts(request, { q: "taladro" });

  await homePage.goto();
  await homePage.header.search("taladro");

  await expect(page).toHaveURL(`${BASE_URL}/es/search?q=taladro`);
  await expect(searchPage.heading).toHaveText(t.Search.resultsFor.replace("{query}", "taladro"));
  await expect(searchPage.resultCount).toHaveText(countText(results.total));
  await expect(searchPage.products).toHaveCount(results.items.length);
});

test("a short query asks for more letters", async ({ searchPage }) => {
  await searchPage.search("t");

  await expect(searchPage.hint).toBeVisible();
  await expect(searchPage.products).toHaveCount(0);
});

test("unknown or malformed categories answer 404", async ({ request }) => {
  for (const slug of ["no-such-category", "Bad_Slug"]) {
    const response = await request.get(`/es${categoryPath(slug)}`);
    expect(response.status(), slug).toBe(404);
  }
});

test("listings declare their canonical URL and stay out of the index when searched", async ({ request }) => {
  const category = await largestCategory(request);
  const path = categoryPath(category.slug);

  const listing = await (await request.get(`/es${path}?brand=bosch&sort=name&page=2`)).text();
  expect(listing).toContain(`<link rel="canonical" href="${BASE_URL}/es${path}?page=2"/>`);
  expect(listing).toContain(`<link rel="alternate" hrefLang="en" href="${BASE_URL}/en${path}?page=2"/>`);
  expect(listing).toContain(`<link rel="alternate" hrefLang="x-default" href="${BASE_URL}/es${path}?page=2"/>`);

  const search = await (await request.get("/es/search?q=taladro")).text();
  expect(search).toMatch(/<meta name="robots" content="noindex, follow"/);
});
