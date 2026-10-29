import { AppPage } from "./app-page";

export class VerifyEmailPage extends AppPage {
  protected readonly path = "/verify-email";
  readonly success = this.main.getByText(this.t.Auth.verify.success);
}
