import type { Locator } from "@playwright/test";

import { AppPage } from "./app-page";

export class CartPage extends AppPage {
  protected readonly path = "/cart";
  readonly lines = this.main.getByRole("region", { name: this.t.Cart.lines });
  readonly summary = this.main.getByRole("region", { name: this.t.Cart.summary.title });
  readonly empty = this.main.getByRole("heading", { name: this.t.Cart.empty.title });
  readonly loginToCheckout = this.main.getByRole("link", { name: this.t.Cart.loginToCheckout });
  readonly mergeNotice = this.main.getByRole("status").filter({ hasText: this.t.Cart.merged.title });

  line(productName: string): Locator {
    return this.lines
      .getByRole("listitem")
      .filter({ has: this.page.getByRole("link", { name: productName, exact: true }) });
  }

  quantity(productName: string): Locator {
    return this.line(productName).getByRole("spinbutton");
  }

  async setQuantity(productName: string, units: number): Promise<void> {
    await this.quantity(productName).fill(String(units));
    await this.quantity(productName).press("Enter");
  }

  async increase(productName: string): Promise<void> {
    await this.line(productName).getByRole("button", { name: this.t.Cart.increase }).click();
  }

  async remove(productName: string): Promise<void> {
    await this.line(productName)
      .getByRole("button", { name: this.t.Cart.remove.replace("{name}", productName) })
      .click();
  }
}
