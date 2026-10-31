import { randomUUID } from "node:crypto";

import { formatMoney } from "../../src/lib/money";
import { AdminProductPage } from "../pages/admin-product-page";
import { ProductPage } from "../pages/product-page";
import { changeVariantPrice } from "../support/admin";
import { adminTest, expect } from "../support/fixtures";
import { messages } from "../support/i18n";
import { productDetail } from "../support/catalog";

const t = messages.es;
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

function picture(name: string) {
  return { name, mimeType: "image/png", buffer: PNG };
}

adminTest("a product built in the panel reaches the store and stays in sync", async ({ page, context }) => {
  const id = randomUUID().slice(0, 8);
  const slug = `e2e-${id}`;
  const sku = `E2E-${id}`;
  const name = `Producto ${id}`;
  const creator = new AdminProductPage(page, "new");
  const store = new ProductPage(page, slug);
  let editor = creator;

  const expectStorePrice = async () => {
    const { variants } = await productDetail(context.request, slug);
    await store.goto();
    await expect(store.main).toContainText(formatMoney(variants[0].price, "es").replace(/\s/g, " "));
  };

  await adminTest.step("a missing translation opens its language", async () => {
    await creator.goto();
    await creator.fillBasics(slug);
    await creator.fillTexts("es", name);
    await creator.save();
    await expect(creator.tab("en")).toHaveAttribute("aria-selected", "true");
    await expect(creator.main.getByText(t.Validation.required).first()).toBeVisible();
  });

  await adminTest.step("saving opens the product, where it gets a variant", async () => {
    await creator.fillTexts("en", `Product ${id}`);
    await creator.save();
    await page.waitForURL(/\/admin\/products\/\d+$/);
    editor = new AdminProductPage(page, AdminProductPage.idIn(page));
    await expect(editor.heading).toHaveText(name);
    await editor.addVariant({ sku, price: "100", stock: "5" });
    await expect(editor.sheet).toBeHidden();
    await expect(editor.variantRow(sku)).toContainText("US$");
  });

  await adminTest.step("real images are stored, ordered and shown in the store", async () => {
    await editor.upload(picture("uno.png"));
    await expect(editor.imageItems).toHaveCount(1);
    await editor.upload(picture("dos.png"));
    await expect(editor.imageItems).toHaveCount(2);
    await editor.editImageAlt(1, "Primera", "First");
    await expect(editor.sheet).toBeHidden();
    await expect(editor.imageItems.first()).toContainText("Primera");
    await editor.moveDown(1);
    await expect(editor.imageItems.last()).toContainText("Primera");

    await store.goto();
    await expect(store.heading).toHaveText(name);
    const image = store.main.getByRole("img").first();
    await expect(image).toHaveAttribute("src", /\/media\/products\//);
    await image.evaluate((element: HTMLImageElement) => element.decode());
    const chosen = await image.evaluate((element: HTMLImageElement) => element.currentSrc);
    const file = await context.request.get(chosen);
    expect(file.status()).toBe(200);
    expect(file.headers()["content-type"]).toBe("image/webp");
  });

  await adminTest.step("a price change shows on the next load of the store", async () => {
    await expectStorePrice();
    await editor.goto();
    await editor.editVariant(sku);
    await editor.typePrice("250");
    await editor.saveSheet();
    await expect(editor.sheet).toBeHidden();
    await expectStorePrice();
  });

  await adminTest.step("a stale variant form reloads with the current values", async () => {
    await editor.goto();
    await editor.editVariant(sku);
    await expect(editor.priceField()).toHaveValue("250.00");
    await changeVariantPrice(context.request, AdminProductPage.idIn(page), sku, "300");
    await editor.typePrice("275");
    await editor.saveSheet();
    await expect(editor.sheet.getByRole("alert")).toContainText(t.Errors.version_conflict);
    await expect(editor.priceField()).toHaveValue("300.00");
    await editor.saveSheet();
    await expect(editor.sheet).toBeHidden();
  });

  await adminTest.step("stock changes apart from the form and cannot go below zero", async () => {
    await editor.adjustStock(sku, "3", "Compra");
    await expect(editor.sheet).toBeHidden();
    await expect(editor.variantRow(sku)).toContainText("8");
    await editor.adjustStock(sku, "-100", "Error de carga");
    await expect(editor.sheet.getByRole("alert")).toContainText("quedan 8 unidades");
    await editor.sheet.getByRole("button", { name: t.Admin.cancel }).click();
  });

  await adminTest.step("archiving takes it out of the store, and its files go away", async () => {
    await editor.deleteImage(2);
    await expect(editor.imageItems).toHaveCount(1);
    await editor.deleteImage(1);
    await expect(editor.imageItems).toHaveCount(0);
    await editor.archive();
    await expect(editor.main.getByRole("button", { name: t.Admin.products.restore })).toBeVisible();
    const response = await page.goto(store.url);
    expect(response?.status()).toBe(404);
  });
});
