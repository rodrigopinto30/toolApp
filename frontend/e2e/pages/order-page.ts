import type { Page } from "@playwright/test";

import { orderPath } from "../../src/features/orders/paths";
import type { Locale } from "../support/i18n";
import { AppPage } from "./app-page";
import { APPROVED_CARD, fillCard, type CardNumber } from "./card-form";

export class OrderPage extends AppPage {
  readonly status = this.main.locator("header [data-slot=badge]");
  readonly notice = this.main.getByRole("status");
  readonly notFound = this.main.getByText(this.t.Orders.detail.notFound);
  readonly payments = this.main.getByRole("region", { name: this.t.Orders.payments.title });
  readonly retryForm = this.main.getByRole("form", { name: this.t.Orders.pay.title });
  readonly cancelButton = this.main.getByRole("button", { name: this.t.Orders.cancel.open });
  readonly dialog = this.page.getByRole("alertdialog");
  protected readonly path: string;

  constructor(page: Page, number: string, locale: Locale = "es") {
    super(page, locale);
    this.path = orderPath(number);
  }

  static numberIn(page: Page): string {
    return new URL(page.url()).pathname.split("/").at(-1) ?? "";
  }

  async retryPayment(number: CardNumber = APPROVED_CARD): Promise<void> {
    await fillCard(this.retryForm, this.t, number);
    await this.retryForm.getByRole("button", { name: /\$/ }).click();
  }

  async cancel(): Promise<void> {
    await this.cancelButton.click();
    await this.dialog.getByRole("button", { name: this.t.Orders.cancel.confirm }).click();
  }
}
