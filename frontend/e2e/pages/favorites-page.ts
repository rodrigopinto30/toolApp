import { AppPage } from "./app-page";

export class FavoritesPage extends AppPage {
  protected readonly path = "/account/favorites";
  readonly empty = this.main.getByText(this.t.Favorites.empty.title);
  readonly products = this.main.getByRole("article");
}
