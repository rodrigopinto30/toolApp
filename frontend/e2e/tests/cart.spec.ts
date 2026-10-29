import { formatMoney } from "../../src/lib/money";
import { CartPage } from "../pages/cart-page";
import { LoginPage } from "../pages/login-page";
import { ProductPage } from "../pages/product-page";
import { cartVariants, emptyServerCart, quoteCart, serverCart, setServerLine } from "../support/cart";
import { customerTest, expect, test } from "../support/fixtures";
import { messages } from "../support/i18n";
import { BASE_URL } from "../support/stack";

const t = messages.es;

function units(count: number): RegExp {
  return new RegExp(`\\b${count} unidad`);
}

test("a guest adds a product, changes it in the cart and keeps it after a reload", async ({ page, request }) => {
  const { plenty } = await cartVariants(request);
  const productPage = new ProductPage(page, plenty.product_slug);
  const cartPage = new CartPage(page);
  const [two, three] = await Promise.all(
    [2, 3].map(async (quantity) => (await quoteCart(request, [{ variant_id: plenty.variant_id, quantity }])).items[0]),
  );

  await test.step("the product page adds the selected variant", async () => {
    await productPage.gotoVariant(plenty.sku);
    await productPage.addToCart(2);
    await expect(productPage.added).toBeVisible();
    await expect(productPage.header.cartLink).toHaveAccessibleName(units(2));
  });

  await test.step("the cart shows the line priced by the API", async () => {
    await productPage.viewCart.click();
    await expect(page).toHaveURL(`${BASE_URL}${cartPage.url}`);
    const line = cartPage.line(plenty.product_name);
    await expect(line).toContainText(formatMoney(two.line_total, "es"));
    if (plenty.variant_label) {
      await expect(line).toContainText(plenty.variant_label);
    }
    await expect(cartPage.summary).toContainText(formatMoney(two.line_total, "es"));
  });

  await test.step("the cart survives a reload and follows the quantity", async () => {
    await page.reload();
    await cartPage.increase(plenty.product_name);
    await expect(cartPage.line(plenty.product_name)).toContainText(formatMoney(three.line_total, "es"));
    await expect(cartPage.header.cartLink).toHaveAccessibleName(units(3));
  });

  await test.step("removing the last line leaves the cart empty", async () => {
    await cartPage.remove(plenty.product_name);
    await expect(cartPage.empty).toBeVisible();
  });
});

test("a guest sees how many units are left and keeps them with one click", async ({ page, request }) => {
  const { limited } = await cartVariants(request);
  const productPage = new ProductPage(page, limited.product_slug);
  const cartPage = new CartPage(page);
  const available = limited.available ?? 0;

  await productPage.gotoVariant(limited.sku);
  await productPage.addToCart(1);
  await expect(productPage.added).toBeVisible();
  await cartPage.goto();
  await cartPage.setQuantity(limited.product_name, 99);

  const line = cartPage.line(limited.product_name);
  await expect(line).toContainText(`Solo quedan ${available} unidades.`);
  await expect(cartPage.summary).toContainText(t.Cart.summary.issues);
  await line.getByRole("button", { name: `Dejar ${available} unidades` }).click();
  await expect(line).not.toContainText("Solo quedan");
  await expect(cartPage.quantity(limited.product_name)).toHaveValue(String(available));
});

test("the guest cart joins the account on login with the largest quantities", async ({
  page,
  request,
  playwright,
  buyer,
}) => {
  const { plenty, limited } = await cartVariants(request);
  const account = await playwright.request.newContext({ baseURL: BASE_URL, storageState: buyer.storageState });
  await emptyServerCart(account);
  await setServerLine(account, plenty.variant_id, 5);
  const cartPage = new CartPage(page);
  const loginPage = new LoginPage(page);

  await test.step("the guest picks fewer units of one product and too many of another", async () => {
    for (const [line, quantity] of [
      [plenty, 2],
      [limited, 99],
    ] as const) {
      const productPage = new ProductPage(page, line.product_slug);
      await productPage.gotoVariant(line.sku);
      await productPage.addToCart(quantity);
      await expect(productPage.added).toBeVisible();
    }
    await cartPage.goto();
    await expect(cartPage.loginToCheckout).toHaveAttribute("href", "/es/login?next=%2Fes%2Fcheckout");
  });

  await test.step("logging in merges both carts and explains the adjustment", async () => {
    await loginPage.goto("/es/cart");
    await loginPage.login(buyer);
    await expect(page).toHaveURL(`${BASE_URL}${cartPage.url}`);
    await expect(cartPage.quantity(plenty.product_name)).toHaveValue("5");
    await expect(cartPage.quantity(limited.product_name)).toHaveValue(String(limited.available));
    await expect(cartPage.mergeNotice).toContainText(limited.product_name);
  });

  const merged = await serverCart(account);
  expect(merged.items.map((line) => [line.variant_id, line.quantity])).toEqual([
    [plenty.variant_id, 5],
    [limited.variant_id, limited.available],
  ]);
  await account.dispose();
});

customerTest("a customer adds to the server cart and hears about the stock limit", async ({ page, context, request }) => {
  const { plenty, limited } = await cartVariants(request);
  const productPage = new ProductPage(page, plenty.product_slug);
  const cartPage = new CartPage(page);

  await productPage.gotoVariant(plenty.sku);
  await productPage.addToCart(1);
  await expect(productPage.added).toBeVisible();
  await productPage.addToCart(1);
  await expect(productPage.header.cartLink).toHaveAccessibleName(units(2));
  expect((await serverCart(context.request)).items.map((line) => line.quantity)).toEqual([2]);

  const limitedPage = new ProductPage(page, limited.product_slug);
  await limitedPage.gotoVariant(limited.sku);
  await limitedPage.addToCart(99);
  await expect(limitedPage.buy).toContainText(`No hay stock suficiente: quedan ${limited.available} unidades.`);

  await cartPage.goto();
  await expect(cartPage.quantity(plenty.product_name)).toHaveValue("2");
  await expect(cartPage.line(limited.product_name)).toHaveCount(0);
});
