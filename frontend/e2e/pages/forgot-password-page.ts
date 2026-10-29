import { AppPage } from "./app-page";

export class ForgotPasswordPage extends AppPage {
  protected readonly path = "/forgot-password";
  readonly email = this.main.getByLabel(this.t.Auth.forgot.email, { exact: true });
  readonly submit = this.main.getByRole("button", { name: this.t.Auth.forgot.submit, exact: true });
  readonly success = this.main.getByText(this.t.Auth.forgot.success);

  async requestLink(email: string): Promise<void> {
    await this.email.fill(email);
    await this.submit.click();
  }
}
