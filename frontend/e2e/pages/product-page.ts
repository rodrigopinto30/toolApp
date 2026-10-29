import type { Page } from "@playwright/test";

import { productPath } from "../../src/features/catalog/paths";
import type { Locale } from "../support/i18n";
import { AppPage } from "./app-page";

export class ProductPage extends AppPage {
  readonly breadcrumbs = this.main.getByRole("navigation", { name: this.t.Breadcrumbs.label });
  readonly sku = this.main.getByText(/^SKU: /);
  readonly province = this.main.getByRole("combobox", { name: this.t.Product.shipping.province });
  readonly quantity = this.main.getByRole("spinbutton", { name: this.t.Product.shipping.quantity });
  readonly estimate = this.main.getByRole("button", { name: this.t.Product.shipping.submit, exact: true });
  readonly quote = this.main.getByRole("status");
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

  async chooseProvince(name: string): Promise<void> {
    await this.province.click();
    await this.page.getByRole("option", { name, exact: true }).click();
  }
}
