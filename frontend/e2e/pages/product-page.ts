import type { Page } from "@playwright/test";

import { productPath } from "../../src/features/catalog/paths";
import type { Locale } from "../support/i18n";
import { AppPage } from "./app-page";

export class ProductPage extends AppPage {
  readonly breadcrumbs = this.main.getByRole("navigation", { name: this.t.Breadcrumbs.label });
  readonly sku = this.main.getByText(/^SKU: /);
  readonly shipping = this.main.getByRole("form", { name: this.t.Product.shipping.title });
  readonly province = this.shipping.getByRole("combobox", { name: this.t.Product.shipping.province });
  readonly quantity = this.shipping.getByRole("spinbutton", { name: this.t.Product.shipping.quantity });
  readonly estimate = this.shipping.getByRole("button", { name: this.t.Product.shipping.submit, exact: true });
  readonly quote = this.shipping.getByRole("status");
  readonly buy = this.main.getByRole("form", { name: this.t.Cart.add.label });
  readonly buyQuantity = this.buy.getByRole("spinbutton", { name: this.t.Cart.quantity });
  readonly addToCartButton = this.buy.getByRole("button", { name: this.t.Cart.add.submit });
  readonly added = this.buy.getByText(this.t.Cart.add.added);
  readonly viewCart = this.buy.getByRole("link", { name: this.t.Cart.add.view });
  readonly reviews = this.main.getByRole("region", { name: this.t.Reviews.title });
  protected readonly path: string;

  constructor(page: Page, slug: string, locale: Locale = "es") {
    super(page, locale);
    this.path = productPath(slug);
  }

  variant(label: string) {
    return this.main.getByRole("radio", { name: label });
  }

  async chooseVariant(label: string): Promise<void> {
    await this.variant(label).locator("..").click();
  }

  async chooseDelivery(method: "shipping" | "pickup"): Promise<void> {
    await this.main.locator("label").filter({ hasText: this.t.Product.shipping.methods[method] }).click();
  }

  async gotoVariant(sku: string): Promise<void> {
    await this.page.goto(`${this.url}?variant=${encodeURIComponent(sku)}`);
  }

  async addToCart(units: number): Promise<void> {
    await this.buyQuantity.fill(String(units));
    await this.addToCartButton.click();
  }

  async chooseProvince(name: string): Promise<void> {
    await this.province.click();
    await this.page.getByRole("option", { name, exact: true }).click();
  }
}
