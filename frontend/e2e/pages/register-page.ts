import { expect } from "@playwright/test";

import type { TestUser } from "../support/users";
import { AppPage } from "./app-page";

export class RegisterPage extends AppPage {
  protected readonly path = "/register";
  readonly firstName = this.main.getByLabel(this.t.Auth.register.firstName, { exact: true });
  readonly lastName = this.main.getByLabel(this.t.Auth.register.lastName, { exact: true });
  readonly email = this.main.getByLabel(this.t.Auth.register.email, { exact: true });
  readonly password = this.main.getByLabel(this.t.Auth.register.password, { exact: true });
  readonly submit = this.main.getByRole("button", { name: this.t.Auth.register.submit, exact: true });
  readonly success = this.main.getByRole("heading", { name: this.t.Auth.register.successTitle });

  async fill(user: TestUser): Promise<void> {
    await expect(this.submit).toBeEnabled();
    await this.firstName.fill(user.firstName);
    await this.lastName.fill(user.lastName);
    await this.email.fill(user.email);
    await this.password.fill(user.password);
  }

  async register(user: TestUser): Promise<void> {
    await this.fill(user);
    await this.submit.click();
  }
}
