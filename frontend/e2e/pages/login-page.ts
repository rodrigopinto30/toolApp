import { expect } from "@playwright/test";

import type { Locale } from "../support/i18n";
import type { Credentials } from "../support/users";
import { AppPage } from "./app-page";

export function redirectedToLogin(next: string, locale: Locale = "es") {
  return (url: URL) => url.pathname === `/${locale}/login` && url.searchParams.get("next") === next;
}

export class LoginPage extends AppPage {
  protected readonly path = "/login";
  readonly email = this.main.getByLabel(this.t.Auth.login.email, { exact: true });
  readonly password = this.main.getByLabel(this.t.Auth.login.password, { exact: true });
  readonly submit = this.main.getByRole("button", { name: this.t.Auth.login.submit, exact: true });

  async goto(next?: string): Promise<void> {
    await this.page.goto(next === undefined ? this.url : `${this.url}?${new URLSearchParams({ next })}`);
  }

  async login({ email, password }: Credentials): Promise<void> {
    await expect(this.submit).toBeEnabled();
    await this.email.fill(email);
    await this.password.fill(password);
    await this.submit.click();
  }
}
