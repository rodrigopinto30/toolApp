import type { Locator, Page } from "@playwright/test";

import type { Currency } from "../../src/lib/currency";
import { messages, type Locale, type Messages } from "../support/i18n";

export class SiteHeader {
  readonly accountMenu: Locator;
  readonly loginLink: Locator;
  readonly currency: Locator;
  readonly language: Locator;
  private readonly page: Page;
  private readonly t: Messages;

  constructor(page: Page, locale: Locale) {
    this.page = page;
    this.t = messages[locale];
    const banner = page.getByRole("banner");
    this.accountMenu = banner.getByRole("button", { name: this.t.UserMenu.label });
    this.loginLink = banner.getByRole("link", { name: this.t.UserMenu.login, exact: true });
    this.currency = banner.getByRole("button", { name: this.t.CurrencySwitcher.label });
    this.language = banner.getByRole("button", { name: this.t.LocaleSwitcher.label });
  }

  async chooseCurrency(currency: Currency): Promise<void> {
    await this.currency.click();
    await this.page.getByRole("menuitem", { name: this.t.CurrencySwitcher[currency] }).click();
  }

  async chooseLanguage(locale: Locale): Promise<void> {
    await this.language.click();
    await this.page.getByRole("menuitem", { name: this.t.LocaleSwitcher[locale] }).click();
  }
}
