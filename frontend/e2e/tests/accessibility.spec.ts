import { type Page } from "@playwright/test";

import { AdminOrderPage } from "../pages/admin-operations-page";
import { AdminCouponsPage } from "../pages/admin-page";
import { OrderPage } from "../pages/order-page";
import { expectAccessible } from "../support/accessibility";
import { firstProductId } from "../support/admin";
import { fillServerCart } from "../support/cart";
import { largestCategory, searchProducts } from "../support/catalog";
import { adminCheckoutTest, adminTest, checkoutTest, customerTest, expect, test } from "../support/fixtures";
import { messages } from "../support/i18n";

const t = messages.es;
const COLOR_SCHEMES = ["light", "dark"] as const;
const PHONE = { width: 375, height: 812 };
const VISITOR_PAGES = {
  home: "/es",
  search: "/es/search?q=taladro",
  "empty cart": "/es/cart",
  login: "/es/login",
  register: "/es/register",
  "forgot password": "/es/forgot-password",
};
const ACCOUNT_PAGES = {
  account: "/es/account",
  addresses: "/es/account/addresses",
  billing: "/es/account/billing",
  favorites: "/es/account/favorites",
  reviews: "/es/account/reviews",
};
const ADMIN_PAGES = [
  "orders",
  "reviews",
  "users",
  "products",
  "products/new",
  "categories",
  "brands",
  "attributes",
  "coupons",
  "exchange-rates",
  "shipping",
  "pickup-points",
  "audit",
];

async function scan(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await expectAccessible(page);
}

customerTest.use({ buyerName: "accessibility" });

for (const colorScheme of COLOR_SCHEMES) {
  test.describe(`${colorScheme} theme`, () => {
    test.use({ colorScheme, contextOptions: { reducedMotion: "reduce" } });

    for (const [name, path] of Object.entries(VISITOR_PAGES)) {
      test(`${name} page`, async ({ page }) => {
        await scan(page, path);
      });
    }

    test("category page", async ({ page, request }) => {
      const category = await largestCategory(request);
      await scan(page, `/es/categories/${category.slug}`);
      await expect(page.getByRole("heading", { level: 2, name: t.Listing.results })).toBeAttached();
    });

    test("product page", async ({ page, request }) => {
      const { items } = await searchProducts(request, { size: "1" });
      await scan(page, `/es/products/${items[0].slug}`);
    });

    test("login form with errors", async ({ page, loginPage }) => {
      await loginPage.goto();
      await expect(loginPage.submit).toBeEnabled();
      await loginPage.submit.click();
      await expect(loginPage.email).toHaveAttribute("aria-invalid", "true");
      await expectAccessible(page);
    });

    customerTest("cart with products", async ({ page, context }) => {
      await fillServerCart(context.request);
      await scan(page, "/es/cart");
    });

    checkoutTest("checkout and the order it places", async ({ page, context, checkoutPage }) => {
      await fillServerCart(context.request);
      await checkoutPage.goto();
      await checkoutPage.chooseDelivery("pickup");
      await expectAccessible(page);

      await checkoutPage.pay();
      await expect(page).toHaveURL(checkoutPage.orderUrl());
      await expectAccessible(page);

      await scan(page, "/es/account/orders");
    });

    for (const [name, path] of Object.entries(ACCOUNT_PAGES)) {
      customerTest(`${name} page`, async ({ page }) => {
        await scan(page, path);
      });
    }

    for (const path of ADMIN_PAGES) {
      adminTest(`admin ${path} page`, async ({ page }) => {
        await scan(page, `/es/admin/${path}`);
      });
    }

    adminTest("admin product editor", async ({ page, context }) => {
      await scan(page, `/es/admin/products/${await firstProductId(context.request)}`);
    });

    adminTest("admin form with errors", async ({ page }) => {
      const couponsPage = new AdminCouponsPage(page);
      await couponsPage.goto();
      await couponsPage.add.click();
      await couponsPage.sheet.getByRole("button", { name: t.Admin.save }).click();
      await expect(couponsPage.sheet.locator('[aria-invalid="true"]').first()).toBeVisible();
      await expectAccessible(page);
    });

    adminCheckoutTest("admin order and its refund dialog", async ({ page, context, checkoutPage }) => {
      await fillServerCart(context.request);
      await checkoutPage.goto();
      await checkoutPage.chooseDelivery("pickup");
      await checkoutPage.pay();
      await expect(page).toHaveURL(checkoutPage.orderUrl());

      const orderPage = new AdminOrderPage(page, OrderPage.numberIn(page));
      await scan(page, orderPage.url);
      await orderPage.action("refunded").click();
      await expect(orderPage.dialog).toBeVisible();
      await expectAccessible(page);
    });

    test.describe("on a phone", () => {
      test.use({ viewport: PHONE });

      test("category menu", async ({ page, homePage }) => {
        await scan(page, "/es");
        await homePage.header.categoryMenu.click();
        await expect(homePage.header.categoryMenu).toHaveAttribute("aria-expanded", "true");
        await expectAccessible(page);
      });

      adminTest("admin sections", async ({ page }) => {
        await scan(page, "/es/admin/orders");
        await page.getByRole("button", { name: t.Admin.nav.open }).click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await expectAccessible(page);
      });
    });
  });
}
