import { expect, type Locator, type Page } from "@playwright/test";

import { messages, type Locale, type Messages } from "../support/i18n";
import { SiteHeader } from "./site-header";

export abstract class AppPage {
  readonly page: Page;
  readonly locale: Locale;
  readonly header: SiteHeader;
  readonly heading: Locator;
  readonly alert: Locator;
  readonly main: Locator;
  protected readonly t: Messages;
  protected abstract readonly path: string;

  constructor(page: Page, locale: Locale = "es") {
    this.page = page;
    this.locale = locale;
    this.t = messages[locale];
    this.header = new SiteHeader(page, locale);
    this.main = page.getByRole("main");
    this.heading = this.main.getByRole("heading", { level: 1 });
    this.alert = this.main.getByRole("alert");
  }

  get url(): string {
    return `/${this.locale}${this.path}`;
  }

  async goto(): Promise<void> {
    await this.open(this.url);
  }

  protected async open(url: string): Promise<void> {
    await this.page.goto(url);
    await expect
      .poll(
        () => this.header.currency.evaluate((button) => Object.keys(button).some((key) => key.startsWith("__reactProps"))),
        { intervals: [50] },
      )
      .toBe(true);
  }

  favorite(name: string, pressed?: boolean): Locator {
    return this.main.getByRole("button", { name: this.t.Favorites.toggle.replace("{name}", name), pressed });
  }

  async openLink(link: string): Promise<void> {
    await this.page.goto("about:blank");
    await this.page.goto(link);
  }
}
