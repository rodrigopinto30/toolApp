import { randomUUID } from "node:crypto";

import {
  AdminAuditPage,
  AdminCouponsPage,
  AdminExchangeRatesPage,
  AdminPickupPointsPage,
  AdminShippingPage,
} from "../pages/admin-page";
import { CheckoutPage } from "../pages/checkout-page";
import { redirectedToLogin } from "../pages/login-page";
import { adminCoupon } from "../support/admin";
import { fillServerCart } from "../support/cart";
import { adminTest, expect, test, unverifiedTest } from "../support/fixtures";
import { messages } from "../support/i18n";

const t = messages.es;
const ADMIN_PAGES = [
  "products",
  "categories",
  "brands",
  "attributes",
  "coupons",
  "exchange-rates",
  "shipping",
  "pickup-points",
  "audit",
];
const PHONE_WIDTH = 375;

function suffix(): string {
  return randomUUID().slice(0, 8);
}

test("a visitor goes to login from any panel page", async ({ page }) => {
  await page.goto("/es/admin/coupons");

  await page.waitForURL(redirectedToLogin("/es/admin/coupons"));
});

unverifiedTest("a customer sees not-found on every panel page and no panel link", async ({ page }) => {
  for (const name of ADMIN_PAGES) {
    await page.goto(`/es/admin/${name}`);
    await expect(page.getByRole("main").getByRole("heading", { name: t.NotFound.title })).toBeVisible();
  }
  await page.getByRole("banner").getByRole("button", { name: t.UserMenu.label }).click();
  await expect(page.getByRole("menuitem", { name: t.UserMenu.account })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: t.UserMenu.admin })).toHaveCount(0);
});

adminTest("an admin reaches the panel from the user menu", async ({ page }) => {
  const couponsPage = new AdminCouponsPage(page);

  await page.goto("/es");
  await page.getByRole("banner").getByRole("button", { name: t.UserMenu.label }).click();
  await page.getByRole("menuitem", { name: t.UserMenu.admin }).click();

  await page.waitForURL(`**${couponsPage.url}`);
  await expect(couponsPage.heading).toHaveText(t.Admin.coupons.title);
  await expect(couponsPage.navigation.getByRole("link", { name: t.Admin.nav.coupons })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

adminTest("every panel page fits a phone, and only its tables scroll", async ({ page }) => {
  await page.setViewportSize({ width: PHONE_WIDTH, height: 812 });

  for (const name of ADMIN_PAGES) {
    await page.goto(`/es/admin/${name}`);
    await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("table").first()).toBeVisible();
    const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(pageWidth, `/admin/${name}`).toBeLessThanOrEqual(PHONE_WIDTH);
  }
});

adminTest("a coupon created in the panel works at checkout and leaves an audit trail", async ({ page, context }) => {
  const code = `E2E-${suffix()}`.toUpperCase();
  const couponsPage = new AdminCouponsPage(page);

  await adminTest.step("a duplicated code is reported on its field", async () => {
    await couponsPage.goto();
    await couponsPage.create({ code, value: "10" });
    await expect(couponsPage.sheet).toBeHidden();
    await expect(couponsPage.row(code)).toContainText("10 %");
    await couponsPage.create({ code, value: "10" });
    await expect(couponsPage.sheet.getByText(t.Errors.code_taken)).toBeVisible();
    await couponsPage.sheet.getByRole("button", { name: t.Admin.cancel }).click();
  });

  await adminTest.step("an edit shows in the list and in the audit log", async () => {
    await couponsPage.changeValue(code, "15");
    await expect(couponsPage.row(code)).toContainText("15 %");
    const { id } = await adminCoupon(context.request, code);
    const auditPage = new AdminAuditPage(page);
    await auditPage.goto();
    await auditPage.filterByEntity("coupon", String(id));
    await expect(auditPage.row("update")).toContainText(`coupon #${id}`);
    await expect(auditPage.row("create")).toContainText(`coupon #${id}`);
    await auditPage.row("update").getByText("1 cambio").click();
    await expect(auditPage.row("update")).toContainText("Después: 15.00");
  });

  await adminTest.step("a customer can use it", async () => {
    await fillServerCart(context.request);
    const checkoutPage = new CheckoutPage(page);
    await checkoutPage.goto();
    await checkoutPage.chooseDelivery("pickup");
    await checkoutPage.applyCoupon(code);
    await expect(checkoutPage.summary).toContainText(`Descuento (${code})`);
  });

  await adminTest.step("it can be deleted while no order uses it", async () => {
    await couponsPage.goto();
    await couponsPage.delete(code);
    await expect(couponsPage.row(code)).toBeHidden();
  });
});

adminTest("a new exchange rate goes on top of the history", async ({ page, context }) => {
  const ratesPage = new AdminExchangeRatesPage(page);
  const { items } = await (await context.request.get("/api/v1/admin/exchange-rates?size=1")).json();

  await ratesPage.goto();
  await expect(ratesPage.row(t.Admin.exchangeRates.current)).toBeVisible();
  const before = await ratesPage.rows.count();
  await ratesPage.create(items[0].rate);

  await expect(ratesPage.sheet).toBeHidden();
  await expect(ratesPage.rows).toHaveCount(before + 1);
  await expect(ratesPage.row(t.Admin.exchangeRates.current)).toHaveCount(1);
});

adminTest("a zone and a pickup point are created and deleted", async ({ page }) => {
  const id = suffix();
  const shippingPage = new AdminShippingPage(page);
  const pointsPage = new AdminPickupPointsPage(page);

  await shippingPage.goto();
  await shippingPage.create({ code: `e2e-${id}`, name: `Zona ${id}`, cost: "12,5", etaMin: "3", etaMax: "7" });
  await expect(shippingPage.row(`e2e-${id}`)).toContainText("3 a 7 días");
  await shippingPage.delete(`e2e-${id}`);
  await expect(shippingPage.row(`e2e-${id}`)).toBeHidden();

  await pointsPage.goto();
  await pointsPage.createInactive(`E2E ${id}`, "Calle Falsa 123");
  await expect(pointsPage.row(`E2E ${id}`)).toContainText(t.Admin.inactive);
  await pointsPage.delete(`E2E ${id}`);
  await expect(pointsPage.row(`E2E ${id}`)).toBeHidden();
});
