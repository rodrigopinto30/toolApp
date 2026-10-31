import type { Locator, Page } from "@playwright/test";

import { ADMIN_ORDERS_PATH, ADMIN_REVIEWS_PATH, ADMIN_USERS_PATH, adminOrderPath } from "../../src/features/admin/paths";
import type { Locale } from "../support/i18n";
import { AppPage } from "./app-page";

export class AdminOrdersPage extends AppPage {
  protected readonly path = ADMIN_ORDERS_PATH;
  readonly navigation = this.page.getByRole("navigation", { name: this.t.Admin.nav.label });

  order(number: string): Locator {
    return this.main.getByRole("link", { name: number, exact: true });
  }

  async filterByNumber(number: string): Promise<void> {
    await this.main.getByLabel(this.t.Admin.orders.number, { exact: true }).fill(number);
    await this.main.getByRole("button", { name: this.t.Admin.orders.apply }).click();
  }
}

export class AdminOrderPage extends AppPage {
  readonly status = this.main.locator("header [data-slot=badge]");
  readonly note = this.main.getByLabel(this.t.Admin.orders.note, { exact: true });
  readonly notice = this.main.getByRole("status");
  readonly finished = this.main.getByText(this.t.Admin.orders.finished);
  readonly dialog = this.page.getByRole("alertdialog");
  protected readonly path: string;

  constructor(page: Page, number: string, locale: Locale = "es") {
    super(page, locale);
    this.path = adminOrderPath(number);
  }

  action(name: keyof Messages["actions"]): Locator {
    return this.main.getByRole("button", { name: this.t.Admin.orders.actions[name], exact: true });
  }

  async refund(): Promise<void> {
    await this.action("refunded").click();
    await this.dialog.getByRole("button", { name: this.t.Admin.orders.confirmRefund }).click();
  }
}

type Messages = (typeof import("../../messages/es.json"))["Admin"]["orders"];

export class AdminReviewsPage extends AppPage {
  protected readonly path = ADMIN_REVIEWS_PATH;

  row(title: string): Locator {
    return this.main.getByRole("row").filter({ hasText: title });
  }

  async approve(title: string): Promise<void> {
    await this.main.getByRole("button", { name: this.t.Admin.reviews.approveItem.replace("{title}", title) }).click();
  }

  async reject(title: string): Promise<void> {
    await this.main.getByRole("button", { name: this.t.Admin.reviews.rejectItem.replace("{title}", title) }).click();
  }
}

export class AdminUsersPage extends AppPage {
  protected readonly path = ADMIN_USERS_PATH;
  readonly dialog = this.page.getByRole("alertdialog");

  row(email: string): Locator {
    return this.main.getByRole("row").filter({ hasText: email });
  }

  button(label: string, email: string): Locator {
    return this.main.getByRole("button", { name: label.replace("{name}", email), exact: true });
  }

  async search(text: string): Promise<void> {
    await this.page.goto(`${this.url}?${new URLSearchParams({ q: text })}`);
  }

  async confirm(label: string, email: string): Promise<void> {
    await this.button(label, email).click();
    await this.dialog.getByRole("button", { name: this.t.Admin.users.confirm }).click();
  }
}
