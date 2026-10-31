import { randomUUID } from "node:crypto";

import { FavoritesPage } from "../pages/favorites-page";
import { redirectedToLogin } from "../pages/login-page";
import { OrderPage } from "../pages/order-page";
import { ProductPage } from "../pages/product-page";
import { ReviewsPage } from "../pages/reviews-page";
import { SearchPage } from "../pages/search-page";
import { approveReview, deliverPickupOrder } from "../support/admin";
import { fillServerCart } from "../support/cart";
import { searchProducts } from "../support/catalog";
import { checkoutTest, expect, test } from "../support/fixtures";
import { messages } from "../support/i18n";

const t = messages.es;

checkoutTest.use({ buyerName: "community" });

test("a guest who clicks a heart goes to login", async ({ page, request }) => {
  const [product] = (await searchProducts(request, { size: "1" })).items;
  const searchPage = new SearchPage(page);

  await searchPage.search(product.name);
  await searchPage.favorite(product.name, false).click();

  await page.waitForURL(redirectedToLogin(`${searchPage.url}?${new URLSearchParams({ q: product.name })}`));
});

checkoutTest("a heart stays after reloading and fills the favorites page", async ({ page, context }) => {
  const [product] = (await searchProducts(context.request, { size: "1" })).items;
  const productPage = new ProductPage(page, product.slug);
  const favoritesPage = new FavoritesPage(page);
  const searchPage = new SearchPage(page);

  await favoritesPage.goto();
  await expect(favoritesPage.empty).toBeVisible();

  await checkoutTest.step("the heart on the product page stays after reloading", async () => {
    await productPage.goto();
    await productPage.favorite(product.name, false).click();
    await expect(productPage.favorite(product.name, true)).toBeVisible();
    await page.reload();
    await expect(productPage.favorite(product.name, true)).toBeEnabled();
  });

  await checkoutTest.step("the cached card fills in for this customer", async () => {
    await searchPage.search(product.name);
    await expect(searchPage.favorite(product.name, true)).toBeEnabled();
  });

  await checkoutTest.step("removing it from the favorites page empties the page", async () => {
    await favoritesPage.goto();
    await expect(favoritesPage.products.filter({ hasText: product.name })).toBeVisible();
    await favoritesPage.favorite(product.name, true).click();
    await expect(favoritesPage.empty).toBeVisible();
  });
});

checkoutTest("a delivered product is reviewed and published after moderation", async ({ page, context, checkoutPage, adminApi }) => {
  const line = await fillServerCart(context.request);
  const review = { rating: 4, title: `Reseña ${randomUUID().slice(0, 8)}`, body: "<b>Muy</b> buena herramienta." };
  const reviewsPage = new ReviewsPage(page);
  const productPage = new ProductPage(page, line.product_slug);

  await checkoutTest.step("a product appears once its order is delivered", async () => {
    await reviewsPage.goto();
    await expect(reviewsPage.writeButton(line.product_name)).toBeHidden();
    await checkoutPage.goto();
    await checkoutPage.chooseDelivery("pickup");
    await checkoutPage.pay();
    await page.waitForURL(checkoutPage.orderUrl());
    await deliverPickupOrder(adminApi, OrderPage.numberIn(page));
    await reviewsPage.goto();
    await expect(reviewsPage.writeButton(line.product_name)).toBeVisible();
  });

  await checkoutTest.step("the review waits for moderation", async () => {
    await reviewsPage.write(line.product_name, review);
    await expect(reviewsPage.sheet).toBeHidden();
    await expect(reviewsPage.sent).toContainText(review.title);
    await expect(reviewsPage.sent).toContainText(t.AccountReviews.status.pending);
    await expect(reviewsPage.writeButton(line.product_name)).toBeHidden();
    await productPage.goto();
    await expect(productPage.reviews).not.toContainText(review.title);
  });

  await checkoutTest.step("once approved it appears on the product page with its rating", async () => {
    await approveReview(adminApi, review.title);
    await productPage.goto();
    await expect(productPage.reviews).toContainText(review.title);
    await expect(productPage.reviews).toContainText(review.body);
    await expect(productPage.reviews.locator("b")).toHaveCount(0);
    await expect(productPage.main.getByText("4 de 5, 1 opinión")).toBeAttached();
    await reviewsPage.goto();
    await expect(reviewsPage.sent).toContainText(t.AccountReviews.status.approved);
  });
});
