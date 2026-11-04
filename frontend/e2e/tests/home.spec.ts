import { formatMoney } from "../../src/lib/money";
import { categoryTree, featuredProducts } from "../support/catalog";
import { expect, test } from "../support/fixtures";
import { messages } from "../support/i18n";
import { BASE_URL } from "../support/stack";

const t = messages.es;
const PHONE_WIDTH = 375;

test("the home page lists the categories and the featured products", async ({ homePage, request }) => {
  const [categories, featured] = await Promise.all([categoryTree(request), featuredProducts(request, "ARS")]);

  await homePage.goto();

  for (const category of categories) {
    await expect(homePage.categories.getByRole("link", { name: category.name, exact: true })).toHaveAttribute(
      "href",
      `/es/categories/${category.slug}`,
    );
  }
  await expect(homePage.featured.getByRole("article")).toHaveCount(featured.length);
  for (const product of featured) {
    const card = homePage.productCard(product.name);
    await expect(card).toContainText(formatMoney(product.price_from, "es"));
    await expect(card.getByRole("link")).toHaveAttribute("href", `/es/products/${product.slug}`);
  }
});

test("featured prices follow the chosen currency", async ({ homePage, request }) => {
  const [product] = await featuredProducts(request, "USD");

  await homePage.goto();
  await homePage.header.chooseCurrency("USD");

  await expect(homePage.productCard(product.name)).toContainText(formatMoney(product.price_from, "es"));
});

test("the category menu links every category", async ({ page, homePage, request }) => {
  const categories = await categoryTree(request);
  const links = categories.flatMap((category) => [category, ...(category.children ?? [])]);

  await homePage.goto();
  await homePage.header.categoryMenu.click();

  await expect(page.getByRole("menuitem")).toHaveCount(links.length);
  for (const category of links) {
    await expect(page.getByRole("menuitem", { name: category.name, exact: true })).toHaveAttribute(
      "href",
      `/es/categories/${category.slug}`,
    );
  }
});

test("the category bar links every top category, under the trust strip", async ({ page, homePage, request }) => {
  const categories = await categoryTree(request);

  await homePage.goto();

  await expect(homePage.header.categoryBar.getByRole("link")).toHaveCount(categories.length);
  for (const category of categories) {
    await expect(homePage.header.categoryBar.getByRole("link", { name: category.name, exact: true })).toHaveAttribute(
      "href",
      `/es/categories/${category.slug}`,
    );
  }
  for (const item of Object.values(t.TrustStrip)) {
    await expect(page.getByRole("banner").getByText(item, { exact: true })).toBeVisible();
  }
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: PHONE_WIDTH, height: 812 } });

  test("the header fits and the category bar scrolls on its own", async ({ page, homePage, request }) => {
    const last = (await categoryTree(request)).at(-1);
    if (!last) {
      throw new Error("The seed needs categories");
    }

    await homePage.goto();
    const link = homePage.header.categoryBar.getByRole("link", { name: last.name, exact: true });
    await expect(homePage.header.searchBox).toBeVisible();
    await expect(homePage.header.categoryMenu).toBeVisible();
    await expect(link).not.toBeInViewport();

    await link.focus();
    await expect(link).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(PHONE_WIDTH);
  });
});

test("the header search opens the search page", async ({ page, homePage }) => {
  await homePage.goto();
  await homePage.header.search("taladro");

  await expect(page).toHaveURL(`${BASE_URL}/es/search?q=taladro`);
});
