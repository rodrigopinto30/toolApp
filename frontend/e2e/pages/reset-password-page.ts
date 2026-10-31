import { expect } from "@playwright/test";

import { AppPage } from "./app-page";

export class ResetPasswordPage extends AppPage {
  protected readonly path = "/reset-password";
  readonly password = this.main.getByLabel(this.t.Auth.reset.password, { exact: true });
  readonly confirm = this.main.getByLabel(this.t.Auth.reset.confirm, { exact: true });
  readonly submit = this.main.getByRole("button", { name: this.t.Auth.reset.submit, exact: true });
  readonly success = this.main.getByText(this.t.Auth.reset.success);

  async reset(password: string, confirm = password): Promise<void> {
    await expect(this.submit).toBeEnabled();
    await this.password.fill(password);
    await this.confirm.fill(confirm);
    await this.submit.click();
  }
}
