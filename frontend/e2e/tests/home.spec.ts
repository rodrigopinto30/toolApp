import { formatMoney } from "../../src/lib/money";
import { categoryTree, featuredProducts } from "../support/catalog";
import { expect, test } from "../support/fixtures";
import { BASE_URL } from "../support/stack";

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

test("the header search opens the search page", async ({ page, homePage }) => {
  await homePage.goto();
  await homePage.header.search("taladro");

  await expect(page).toHaveURL(`${BASE_URL}/es/search?q=taladro`);
});
