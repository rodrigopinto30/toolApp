import { AddressesPage, BillingPage } from "../pages/book-page";
import { customerTest, expect } from "../support/fixtures";

customerTest.use({ buyerName: "books" });

customerTest("a customer keeps a book of addresses", async ({ page }) => {
  const addresses = new AddressesPage(page);
  await addresses.goto();
  await expect(addresses.empty).toBeVisible();

  await customerTest.step("the first address becomes the default", async () => {
    await addresses.add({ label: "Casa", street: "Av. Corrientes" });
    await expect(addresses.defaultBadge("Casa")).toBeVisible();
  });

  await customerTest.step("the default can move to a second address", async () => {
    await addresses.add({ label: "Trabajo", street: "Florida" });
    await expect(addresses.defaultBadge("Trabajo")).toBeHidden();
    await addresses.makeDefault("Trabajo");
    await expect(addresses.defaultBadge("Trabajo")).toBeVisible();
    await expect(addresses.defaultBadge("Casa")).toBeHidden();
  });

  await customerTest.step("an address can be edited", async () => {
    await addresses.edit("Casa");
    await addresses.fill({ label: "Mi casa", street: "Lavalle" });
    await addresses.save();
    await expect(addresses.entry("Mi casa")).toContainText("Lavalle 1234");
  });

  await customerTest.step("deleting the default one promotes the other", async () => {
    await addresses.remove("Trabajo");
    await expect(addresses.entry("Trabajo")).toBeHidden();
    await expect(addresses.defaultBadge("Mi casa")).toBeVisible();
  });

  await customerTest.step("the book survives a reload", async () => {
    await page.reload();
    await expect(addresses.defaultBadge("Mi casa")).toBeVisible();
  });
});

customerTest("a customer keeps a book of billing details", async ({ page }) => {
  const billing = new BillingPage(page);
  await billing.goto();
  await expect(billing.empty).toBeVisible();

  await billing.add({ legalName: "Ana Diaz", taxId: "20-32964233-0", fiscalAddress: "Av. Corrientes 1234" });
  await expect(billing.defaultBadge("Ana Diaz")).toBeVisible();
  await expect(billing.entry("Ana Diaz")).toContainText("CUIT 20329642330");

  await billing.edit("Ana Diaz");
  await billing.fill({ legalName: "Ana Diaz SRL", taxId: "20-32964233-0", fiscalAddress: "Lavalle 500" });
  await billing.save();
  await expect(billing.entry("Ana Diaz SRL")).toContainText("Lavalle 500");

  await billing.remove("Ana Diaz SRL");
  await expect(billing.empty).toBeVisible();
});
