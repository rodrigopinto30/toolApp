import { CheckoutPage } from "../pages/checkout-page";
import { APPROVED_CARD, REJECTED_CARD } from "../pages/card-form";
import { redirectedToLogin } from "../pages/login-page";
import { OrderPage } from "../pages/order-page";
import { fillServerCart, serverCart } from "../support/cart";
import { checkoutTest, expect, test, unverifiedTest } from "../support/fixtures";
import { messages } from "../support/i18n";
import { customerOrder, customerOrders } from "../support/orders";

const t = messages.es;

checkoutTest.use({ buyerName: "checkout" });

test("the checkout asks a visitor to log in first", async ({ page }) => {
  await page.goto("/es/checkout");

  await expect(page).toHaveURL((url) => redirectedToLogin("/es/checkout")(url));
});

unverifiedTest("an unverified customer is asked to confirm the email", async ({ page }) => {
  const checkoutPage = new CheckoutPage(page);

  await checkoutPage.goto();

  await expect(checkoutPage.verifyNotice).toBeVisible();
  await expect(page.getByRole("button", { name: t.Account.verification.resend })).toBeVisible();
});

checkoutTest("a pickup order is paid and leaves no card number behind", async ({ page, context, checkoutPage }) => {
  await fillServerCart(context.request);

  await checkoutPage.goto();
  await checkoutPage.chooseDelivery("pickup");
  await expect(checkoutPage.summary).toContainText(t.Checkout.summary.pickupAt.split("{")[0]);
  await checkoutPage.pay();

  await expect(page).toHaveURL(checkoutPage.orderUrl());
  const order = await customerOrder(context.request, OrderPage.numberIn(page));
  expect([order.status, order.delivery.method]).toEqual(["paid", "pickup"]);
  expect((await serverCart(context.request)).items).toEqual([]);
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }) + location.href);
  expect(stored).not.toContain("4242");
});

checkoutTest("a shipping order with a new address and a coupon", async ({ page, context, checkoutPage }) => {
  const plenty = await fillServerCart(context.request, 8);

  await checkoutPage.goto();
  await checkoutPage.addAddress({
    label: "Oficina",
    recipient: "Ana Prueba",
    phone: "11 5555-5555",
    street: "Av. Corrientes",
    number: "1234",
    city: "CABA",
    province: "Ciudad Autónoma de Buenos Aires",
    postalCode: "C1043",
  });
  await expect(checkoutPage.delivery.getByRole("radio", { name: /Oficina/ })).toBeChecked();
  await checkoutPage.applyCoupon("bienvenida10");
  await expect(checkoutPage.summary).toContainText("Descuento (BIENVENIDA10)");
  await checkoutPage.pay();

  await expect(page).toHaveURL(checkoutPage.orderUrl());
  const order = await customerOrder(context.request, OrderPage.numberIn(page));
  expect(order.coupon?.code).toBe("BIENVENIDA10");
  expect(order.delivery.address?.street).toBe("Av. Corrientes");
  expect(order.items.map((item) => [item.sku, item.quantity])).toEqual([[plenty.sku, 8]]);
});

checkoutTest("billing details and coupons are checked before paying", async ({ context, checkoutPage }) => {
  await fillServerCart(context.request);
  const before = (await customerOrders(context.request)).length;

  await checkoutPage.goto();
  await checkoutPage.chooseDelivery("pickup");
  await checkoutPage.addBillingProfile("20-12345678-5");
  await expect(checkoutPage.billing).toContainText(t.Validation.cuit);
  await checkoutPage.applyCoupon("NO-EXISTE");

  await expect(checkoutPage.coupon).toContainText(t.Errors.coupon_not_found);
  expect(await customerOrders(context.request)).toHaveLength(before);
});

checkoutTest("a double click places a single order", async ({ page, context, checkoutPage }) => {
  await fillServerCart(context.request);
  const before = (await customerOrders(context.request)).length;

  await checkoutPage.goto();
  await checkoutPage.chooseDelivery("pickup");
  await checkoutPage.fillCard(APPROVED_CARD);
  await checkoutPage.payButton.dblclick();

  await expect(page).toHaveURL(checkoutPage.orderUrl());
  expect(await customerOrders(context.request)).toHaveLength(before + 1);
});

checkoutTest("a rejected card keeps the products in the cart", async ({ context, checkoutPage }) => {
  const plenty = await fillServerCart(context.request, 2);

  await checkoutPage.goto();
  await checkoutPage.chooseDelivery("pickup");
  await checkoutPage.pay(REJECTED_CARD);

  await expect(checkoutPage.payment.getByRole("alert")).toContainText(/TA-\d{4}-\d{6}/);
  const [cancelled] = await customerOrders(context.request);
  expect(cancelled.status).toBe("cancelled");
  expect((await serverCart(context.request)).items.map((line) => [line.variant_id, line.quantity])).toEqual([
    [plenty.variant_id, 2],
  ]);
});

checkoutTest("an answer lost on the way back creates a single order", async ({ page, context, checkoutPage }) => {
  await fillServerCart(context.request);
  const before = (await customerOrders(context.request)).length;
  await page.route("**/api/v1/checkout?*", async (route) => {
    await route.fetch();
    await route.abort("connectionreset");
  }, { times: 1 });

  await checkoutPage.goto();
  await checkoutPage.chooseDelivery("pickup");
  await checkoutPage.pay();
  await expect(checkoutPage.payment.getByRole("alert")).toContainText(t.Errors.network_error);
  await checkoutPage.pay();

  await expect(page).toHaveURL(checkoutPage.orderUrl());
  expect(await customerOrders(context.request)).toHaveLength(before + 1);
});

checkoutTest("switching the currency prices the order again", async ({ page, context, checkoutPage }) => {
  await fillServerCart(context.request, 2);

  await checkoutPage.goto();
  await checkoutPage.chooseDelivery("pickup");
  await expect(checkoutPage.payButton).toBeEnabled();
  await checkoutPage.header.chooseCurrency("USD");
  await expect(checkoutPage.summary).toContainText("US$");
  await checkoutPage.pay();

  await expect(page).toHaveURL(checkoutPage.orderUrl());
  const order = await customerOrder(context.request, OrderPage.numberIn(page));
  expect(order.currency).toBe("USD");
});
