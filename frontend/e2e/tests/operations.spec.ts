import { randomUUID } from "node:crypto";

import type { BrowserContext } from "@playwright/test";

import { AdminOrderPage, AdminOrdersPage, AdminReviewsPage, AdminUsersPage } from "../pages/admin-operations-page";
import { CheckoutPage } from "../pages/checkout-page";
import { OrderPage } from "../pages/order-page";
import { ProductPage } from "../pages/product-page";
import { ReviewsPage } from "../pages/reviews-page";
import { csrfHeaders } from "../support/api";
import { deliverPickupOrder, productStock } from "../support/admin";
import { readShopper } from "../support/buyers";
import { emptyServerCart, fillServerCart } from "../support/cart";
import { productDetail } from "../support/catalog";
import { adminTest, expect } from "../support/fixtures";
import { messages } from "../support/i18n";
import { cancelOpenOrders } from "../support/orders";
import { BASE_URL, isDevStack, ignoreHmrReloads } from "../support/stack";

const t = messages.es;
const STATUS_EMAILS = 3;
const CONFIRMATION_EMAILS = 1;

const operationsTest = adminTest.extend<{ customer: BrowserContext }>({
  customer: async ({ browser }, use) => {
    const { storageState } = readShopper("operations");
    const context = await browser.newContext({ baseURL: BASE_URL, storageState });
    await ignoreHmrReloads(context);
    await emptyServerCart(context.request);
    await use(context);
    await cancelOpenOrders(context.request);
    await context.close();
  },
});

async function placeOrder(customer: BrowserContext, units = 1) {
  const line = await fillServerCart(customer.request, units);
  const page = await customer.newPage();
  const checkoutPage = new CheckoutPage(page);
  await checkoutPage.goto();
  await checkoutPage.chooseDelivery("pickup");
  await checkoutPage.pay();
  await page.waitForURL(checkoutPage.orderUrl());
  return { line, page, number: OrderPage.numberIn(page) };
}

operationsTest("an order moves to delivered, with an email for each step", async ({ page, customer, mailbox }) => {
  const { email } = readShopper("operations");
  const emailsBefore = isDevStack ? await mailbox.count(email) : 0;
  const { number, page: customerPage } = await placeOrder(customer);
  const ordersPage = new AdminOrdersPage(page);
  const orderPage = new AdminOrderPage(page, number);

  await operationsTest.step("the panel finds the order by its number", async () => {
    await ordersPage.goto();
    await ordersPage.filterByNumber(number);
    await ordersPage.order(number).click();
    await expect(orderPage.status).toHaveText(t.Orders.status.paid);
    await expect(orderPage.main).toContainText(email);
  });

  await operationsTest.step("each step only offers what comes next", async () => {
    await orderPage.note.fill("Sale en el reparto de la tarde");
    await orderPage.action("preparing").click();
    await expect(orderPage.status).toHaveText(t.Orders.status.preparing);
    await expect(orderPage.main).toContainText("Sale en el reparto de la tarde");
    await expect(orderPage.action("shipped")).toHaveCount(0);
    await orderPage.action("ready_for_pickup").click();
    await expect(orderPage.status).toHaveText(t.Orders.status.ready_for_pickup);
    await expect(orderPage.action("refunded")).toHaveCount(0);
    await orderPage.action("delivered").click();
    await expect(orderPage.status).toHaveText(t.Orders.status.delivered);
    await expect(orderPage.finished).toBeVisible();
  });

  await operationsTest.step("the customer sees it, without the internal note", async () => {
    const customerOrder = new OrderPage(customerPage, number);
    await customerOrder.goto();
    await expect(customerOrder.status).toHaveText(t.Orders.status.delivered);
    await expect(customerOrder.main).not.toContainText("Sale en el reparto de la tarde");
  });

  if (isDevStack) {
    await expect.poll(() => mailbox.count(email)).toBe(emailsBefore + CONFIRMATION_EMAILS + STATUS_EMAILS);
  }
});

operationsTest("a refund returns the stock and the money", async ({ page, customer, adminApi }) => {
  const units = 2;
  const { product_name: name } = await fillServerCart(customer.request);
  const stockBefore = await productStock(adminApi, name);
  await emptyServerCart(customer.request);
  const { number, page: customerPage } = await placeOrder(customer, units);
  expect(await productStock(adminApi, name)).toBe(stockBefore - units);
  const orderPage = new AdminOrderPage(page, number);

  await orderPage.goto();
  await orderPage.action("refunded").click();
  await orderPage.dialog.getByRole("button", { name: t.Admin.keep }).click();
  await expect(orderPage.status).toHaveText(t.Orders.status.paid);
  await orderPage.refund();

  await expect(orderPage.status).toHaveText(t.Orders.status.refunded);
  await expect(orderPage.finished).toBeVisible();
  expect(await productStock(adminApi, name)).toBe(stockBefore);
  const customerOrder = new OrderPage(customerPage, number);
  await customerOrder.goto();
  await expect(customerOrder.payments).toContainText(t.Orders.payments.status.refunded);
});

operationsTest("moderation decides what the store shows, and the rating follows", async ({ page, customer, adminApi }) => {
  const { line, number, page: customerPage } = await placeOrder(customer);
  await deliverPickupOrder(adminApi, number);
  const review = { rating: 5, title: `Moderada ${randomUUID().slice(0, 8)}`, body: "Tal como se ve en las fotos." };
  const customerReviews = new ReviewsPage(customerPage);
  await customerReviews.goto();
  await customerReviews.write(line.product_name, review);
  await expect(customerReviews.sent).toContainText(review.title);
  const before = await productDetail(page.request, line.product_slug);
  const reviewsPage = new AdminReviewsPage(page);
  const productPage = new ProductPage(page, line.product_slug);

  await operationsTest.step("an approved review appears with its rating", async () => {
    await reviewsPage.goto();
    await expect(reviewsPage.row(review.title)).toContainText(t.Admin.reviews.statuses.pending);
    await reviewsPage.approve(review.title);
    await expect(reviewsPage.row(review.title)).toBeHidden();
    await productPage.goto();
    await expect(productPage.reviews).toContainText(review.title);
    expect((await productDetail(page.request, line.product_slug)).rating_count).toBe(before.rating_count + 1);
  });

  await operationsTest.step("rejecting it takes it back out", async () => {
    await page.goto(`${reviewsPage.url}?status=approved`);
    await reviewsPage.reject(review.title);
    await expect(reviewsPage.row(review.title)).toBeHidden();
    await productPage.goto();
    await expect(productPage.reviews).not.toContainText(review.title);
    expect((await productDetail(page.request, line.product_slug)).rating_count).toBe(before.rating_count);
  });
});

operationsTest("an admin manages users, but never their own row", async ({ page, account, request }) => {
  const usersPage = new AdminUsersPage(page);
  const u = t.Admin.users;

  await operationsTest.step("a deactivated user cannot log in", async () => {
    await usersPage.search(account.email);
    await expect(usersPage.row(account.email)).toContainText(u.roles.customer);
    await usersPage.confirm(u.deactivateItem, account.email);
    await expect(usersPage.row(account.email)).toContainText(t.Admin.inactive);
    const login = await request.post("/api/v1/auth/login", {
      headers: await csrfHeaders(request),
      data: { email: account.email, password: account.password },
    });
    expect((await login.json()).code).toBe("account_disabled");
  });

  await operationsTest.step("it can come back and change roles", async () => {
    await usersPage.button(u.activateItem, account.email).click();
    await expect(usersPage.row(account.email)).toContainText(t.Admin.active);
    await usersPage.confirm(u.makeAdminItem, account.email);
    await expect(usersPage.row(account.email)).toContainText(u.roles.admin);
    await usersPage.confirm(u.removeAdminItem, account.email);
    await expect(usersPage.row(account.email)).toContainText(u.roles.customer);
  });

  await operationsTest.step("your own row has no actions", async () => {
    const { email } = readShopper("admin");
    await usersPage.search(email);
    await expect(usersPage.row(email)).toContainText(u.you);
    await expect(usersPage.row(email).getByRole("button")).toHaveCount(0);
  });
});
