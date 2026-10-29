import type { Response } from "@playwright/test";

import { AppPage } from "./app-page";

type Profile = { firstName: string; lastName: string; phone: string };

export class AccountPage extends AppPage {
  protected readonly path = "/account";
  readonly logout = this.main.getByRole("button", { name: this.t.Account.logout, exact: true });
  readonly firstName = this.main.getByLabel(this.t.Account.profile.firstName, { exact: true });
  readonly lastName = this.main.getByLabel(this.t.Account.profile.lastName, { exact: true });
  readonly phone = this.main.getByLabel(this.t.Account.profile.phone, { exact: true });
  readonly saveProfile = this.main.getByRole("button", { name: this.t.Account.profile.submit, exact: true });
  readonly profileSaved = this.main.getByText(this.t.Account.profile.saved);
  readonly currentPassword = this.main.getByLabel(this.t.Account.password.current, { exact: true });
  readonly newPassword = this.main.getByLabel(this.t.Account.password.new, { exact: true });
  readonly confirmPassword = this.main.getByLabel(this.t.Account.password.confirm, { exact: true });
  readonly savePassword = this.main.getByRole("button", { name: this.t.Account.password.submit, exact: true });
  readonly passwordChanged = this.main.getByText(this.t.Account.password.saved);

  async fillProfile(profile: Partial<Profile>): Promise<void> {
    for (const [field, value] of Object.entries(profile) as [keyof Profile, string][]) {
      await this[field].fill(value);
    }
  }

  async submitProfile(): Promise<Response> {
    const response = this.page.waitForResponse(
      (candidate) =>
        candidate.request().method() === "PATCH" && new URL(candidate.url()).pathname === "/api/v1/me",
    );
    await this.saveProfile.click();
    return response;
  }

  async changePassword(current: string, next: string): Promise<void> {
    await this.currentPassword.fill(current);
    await this.newPassword.fill(next);
    await this.confirmPassword.fill(next);
    await this.savePassword.click();
  }
}
