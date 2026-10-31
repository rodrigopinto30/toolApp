import type { Locator, Page } from "@playwright/test";

import { ADMIN_NEW_PRODUCT_PATH, adminProductPath } from "../../src/features/admin/catalog/paths";
import type { Locale } from "../support/i18n";
import { AppPage } from "./app-page";

export type ProductDraft = { slug: string; nameEs: string; nameEn: string };
export type VariantDraft = { sku: string; price: string; stock: string };

export class AdminProductPage extends AppPage {
  readonly sheet = this.page.getByRole("dialog");
  readonly dialog = this.page.getByRole("alertdialog");
  readonly tabs = this.main.getByRole("tab");
  readonly variants = this.main.getByRole("region", { name: this.t.Admin.variants.title });
  readonly images = this.main.getByRole("region", { name: this.t.Admin.images.title });
  readonly imageItems = this.images.getByRole("listitem");
  protected readonly path: string;

  constructor(page: Page, id: number | "new", locale: Locale = "es") {
    super(page, locale);
    this.path = id === "new" ? ADMIN_NEW_PRODUCT_PATH : adminProductPath(id);
  }

  static idIn(page: Page): number {
    return Number(new URL(page.url()).pathname.split("/").at(-1));
  }

  private panel(language: "es" | "en"): Locator {
    return this.main.getByRole("tabpanel", { name: this.t.Admin.products.languages[language] });
  }

  tab(language: "es" | "en"): Locator {
    return this.main.getByRole("tab", { name: this.t.Admin.products.languages[language] });
  }

  async fillTexts(language: "es" | "en", name: string): Promise<void> {
    const t = this.t.Admin.products;
    await this.tab(language).click();
    await this.panel(language).getByLabel(t.name, { exact: true }).fill(name);
    await this.panel(language).getByLabel(t.shortDescription, { exact: true }).fill(`${name}, corta`);
    await this.panel(language).getByLabel(t.description, { exact: true }).fill(`${name}, larga`);
  }

  async fillBasics(slug: string): Promise<void> {
    const t = this.t.Admin.products;
    await this.main.getByLabel(t.slug, { exact: true }).fill(slug);
    await this.main.getByRole("combobox", { name: t.category }).click();
    await this.page.getByRole("option").first().click();
  }

  async save(): Promise<void> {
    await this.main.getByRole("button", { name: this.t.Admin.save, exact: true }).click();
  }

  async addVariant({ sku, price, stock }: VariantDraft): Promise<void> {
    const t = this.t.Admin.variants;
    await this.variants.getByRole("button", { name: t.add }).click();
    await this.sheet.getByLabel(t.sku, { exact: true }).fill(sku);
    await this.sheet.getByLabel(t.price, { exact: true }).fill(price);
    await this.sheet.getByLabel(t.initialStock, { exact: true }).fill(stock);
    await this.saveSheet();
  }

  variantRow(sku: string): Locator {
    return this.variants.getByRole("row").filter({ hasText: sku });
  }

  async editVariant(sku: string): Promise<void> {
    await this.variants.getByRole("button", { name: this.t.Admin.editItem.replace("{name}", sku) }).click();
  }

  async typePrice(price: string): Promise<void> {
    await this.sheet.getByLabel(this.t.Admin.variants.price, { exact: true }).fill(price);
  }

  priceField(): Locator {
    return this.sheet.getByLabel(this.t.Admin.variants.price, { exact: true });
  }

  async saveSheet(): Promise<void> {
    await this.sheet.getByRole("button", { name: this.t.Admin.save, exact: true }).click();
  }

  async adjustStock(sku: string, delta: string, reason: string): Promise<void> {
    const t = this.t.Admin.stock;
    await this.variants
      .getByRole("button", { name: this.t.Admin.variants.stockItem.replace("{sku}", sku) })
      .click();
    await this.sheet.getByLabel(t.delta, { exact: true }).fill(delta);
    await this.sheet.getByLabel(t.reason, { exact: true }).fill(reason);
    await this.saveSheet();
  }

  async upload(file: { name: string; mimeType: string; buffer: Buffer }): Promise<void> {
    await this.images.getByLabel(this.t.Admin.images.upload, { exact: true }).setInputFiles(file);
  }

  async moveDown(position: number): Promise<void> {
    const name = this.t.Admin.images.imageNumber.replace("{number}", String(position));
    await this.images.getByRole("button", { name: this.t.Admin.images.moveDown.replace("{name}", name) }).click();
  }

  async deleteImage(position: number): Promise<void> {
    const name = this.t.Admin.images.imageNumber.replace("{number}", String(position));
    await this.images.getByRole("button", { name: this.t.Admin.deleteItem.replace("{name}", name) }).click();
    await this.dialog.getByRole("button", { name: this.t.Admin.confirmDelete }).click();
  }

  async editImageAlt(position: number, es: string, en: string): Promise<void> {
    const name = this.t.Admin.images.imageNumber.replace("{number}", String(position));
    const label = this.t.Admin.images.alt;
    await this.images.getByRole("button", { name: this.t.Admin.editItem.replace("{name}", name) }).click();
    await this.sheet.getByLabel(this.t.Admin.inSpanish.replace("{label}", label), { exact: true }).fill(es);
    await this.sheet.getByLabel(this.t.Admin.inEnglish.replace("{label}", label), { exact: true }).fill(en);
    await this.saveSheet();
  }

  async archive(): Promise<void> {
    const t = this.t.Admin.products;
    await this.main.getByRole("button", { name: t.archive, exact: true }).first().click();
    await this.dialog.getByRole("button", { name: t.confirmArchive }).click();
  }
}
