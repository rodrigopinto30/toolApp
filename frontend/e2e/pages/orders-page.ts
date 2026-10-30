import type { Locator } from "@playwright/test";

import { AppPage } from "./app-page";

export class OrdersPage extends AppPage {
  protected readonly path = "/account/orders";

  order(number: string): Locator {
    return this.main.getByRole("link", { name: new RegExp(number) });
  }
}
