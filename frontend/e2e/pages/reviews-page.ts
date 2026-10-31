import type { Locator } from "@playwright/test";

import { AppPage } from "./app-page";

export type ReviewDraft = { rating: number; title: string; body: string };

export class ReviewsPage extends AppPage {
  protected readonly path = "/account/reviews";
  readonly sheet = this.page.getByRole("dialog");
  readonly reviewable = this.main.getByRole("region", { name: this.t.AccountReviews.reviewable.title });
  readonly sent = this.main.getByRole("region", { name: this.t.AccountReviews.own.title });

  writeButton(name: string): Locator {
    return this.reviewable.getByRole("button", {
      name: this.t.AccountReviews.reviewable.writeItem.replace("{name}", name),
    });
  }

  async write(name: string, { rating, title, body }: ReviewDraft): Promise<void> {
    const t = this.t.AccountReviews.form;
    await this.writeButton(name).click();
    await this.sheet.getByRole("radio", { name: new RegExp(`^${rating} `) }).locator("..").click();
    await this.sheet.getByLabel(t.headline, { exact: true }).fill(title);
    await this.sheet.getByLabel(t.body, { exact: true }).fill(body);
    await this.sheet.getByRole("button", { name: t.submit }).click();
  }
}
