import { SEARCH_PATH } from "../../src/features/catalog/paths";
import { ListingPage } from "./listing-page";

export class SearchPage extends ListingPage {
  protected readonly path = SEARCH_PATH;
  readonly hint = this.main.getByText(this.t.Search.hint);

  async search(query: string): Promise<void> {
    await this.open(`${this.url}?${new URLSearchParams({ q: query })}`);
  }
}
