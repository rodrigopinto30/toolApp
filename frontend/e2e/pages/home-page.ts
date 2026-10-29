import { AppPage } from "./app-page";

export class HomePage extends AppPage {
  protected readonly path = "";
  readonly categories = this.main.getByRole("region", { name: this.t.Home.categories });
  readonly featured = this.main.getByRole("region", { name: this.t.Home.featured });

  productCard(name: string) {
    return this.featured.getByRole("article").filter({ has: this.page.getByRole("link", { name, exact: true }) });
  }
}
