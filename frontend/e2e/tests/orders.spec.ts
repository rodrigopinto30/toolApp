import { CheckoutPage } from "../pages/checkout-page";
import { REJECTED_CARD, SLOW_CARD } from "../pages/card-form";
import { OrderPage } from "../pages/order-page";
import { OrdersPage } from "../pages/orders-page";
import { fillServerCart, serverCart } from "../support/cart";
import { checkoutTest, expect } from "../support/fixtures";
import { messages } from "../support/i18n";
import { customerOrder } from "../support/orders";
import { BASE_URL, isDevStack } from "../support/stack";

const t = messages.es;

checkoutTest.use({ buyerName: "orders" });

async function placeOrder(checkoutPage: CheckoutPage, card?: Parameters<CheckoutPage["pay"]>[0]): Promise<OrderPage> {
  await checkoutPage.goto();
  await checkoutPage.chooseDelivery("pickup");
  await checkoutPage.pay(card);
  await checkoutPage.page.waitForURL(checkoutPage.orderUrl());
  return new OrderPage(checkoutPage.page, OrderPage.numberIn(checkoutPage.page));
}

checkoutTest("a paid order is confirmed and listed", async ({ page, context, checkoutPage }) => {
  await fillServerCart(context.request);

  const orderPage = await placeOrder(checkoutPage);

  await expect(orderPage.notice).toContainText(t.Orders.placed.paid);
  await expect(orderPage.status).toHaveText(t.Orders.status.paid);
  await expect(orderPage.heading).toContainText(OrderPage.numberIn(page));
  await expect(page).toHaveURL(`${BASE_URL}${orderPage.url}`);

  const number = OrderPage.numberIn(page);
  const ordersPage = new OrdersPage(page);
  await ordersPage.goto();
  await ordersPage.order(number).click();
  await expect(orderPage.payments).toContainText("4242");
});

checkoutTest("a slow payment stays pending and can be retried", async ({ context, checkoutPage }) => {
  await fillServerCart(context.request);

  const orderPage = await placeOrder(checkoutPage, SLOW_CARD);

  await expect(orderPage.notice).toContainText(t.Orders.placed.pending_payment);
  await expect(orderPage.status).toHaveText(t.Orders.status.pending_payment);
  await orderPage.retryPayment();
  await expect(orderPage.status).toHaveText(t.Orders.status.paid);
  await expect(orderPage.notice).toContainText(t.Orders.pay.paid);
  await expect(orderPage.retryForm).toHaveCount(0);
});

checkoutTest("a rejected retry cancels the order and refills the cart", async ({ context, checkoutPage }) => {
  const plenty = await fillServerCart(context.request, 2);

  const orderPage = await placeOrder(checkoutPage, SLOW_CARD);
  await orderPage.retryPayment(REJECTED_CARD);

  await expect(orderPage.status).toHaveText(t.Orders.status.cancelled);
  await expect(orderPage.alert).toContainText(t.Orders.pay.rejected);
  expect((await serverCart(context.request)).items.map((line) => [line.variant_id, line.quantity])).toEqual([
    [plenty.variant_id, 2],
  ]);
});

checkoutTest("cancelling a paid order refunds it", async ({ page, context, checkoutPage }) => {
  await fillServerCart(context.request);

  const orderPage = await placeOrder(checkoutPage);
  const number = OrderPage.numberIn(page);
  await orderPage.cancelButton.click();
  await expect(orderPage.dialog).toContainText("Te reintegramos");
  await orderPage.dialog.getByRole("button", { name: t.Orders.cancel.keep }).click();
  await expect(orderPage.status).toHaveText(t.Orders.status.paid);
  await orderPage.cancel();

  await expect(orderPage.status).toHaveText(t.Orders.status.cancelled);
  await expect(orderPage.payments).toContainText(t.Orders.payments.status.refunded);
  await expect(orderPage.cancelButton).toHaveCount(0);
  expect((await customerOrder(context.request, number)).status).toBe("cancelled");
});

checkoutTest("unknown and malformed order numbers are not found", async ({ page }) => {
  const orderPage = new OrderPage(page, "TA-2026-999999");

  await orderPage.goto();
  await expect(orderPage.notFound).toBeVisible();

  const response = await page.goto("/es/account/orders/not-an-order");
  expect(response?.status()).toBe(404);
});

checkoutTest("the emails open the order and the cart", async ({ page, context, checkoutPage, mailbox, buyer }) => {
  checkoutTest.skip(!isDevStack, "Mailpit only runs in the dev stack");
  await fillServerCart(context.request);

  const orderPage = await placeOrder(checkoutPage);
  await page.goto(await mailbox.link(buyer.email, orderPage.url));
  await expect(orderPage.status).toHaveText(t.Orders.status.paid);

  await fillServerCart(context.request);
  await checkoutPage.goto();
  await checkoutPage.chooseDelivery("pickup");
  await checkoutPage.pay(REJECTED_CARD);
  await expect(checkoutPage.payment.getByRole("alert")).toBeVisible();
  await page.goto(await mailbox.link(buyer.email, "/es/cart"));
  await expect(page).toHaveURL(`${BASE_URL}/es/cart`);
});
