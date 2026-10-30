import { AppPage } from "./app-page";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export abstract class ListingPage extends AppPage {
  readonly resultCount = this.main.getByRole("status");
  readonly sort = this.main.getByRole("combobox", { name: this.t.Listing.sort });
  readonly filters = this.main.getByRole("complementary", { name: this.t.Listing.filters });
  readonly filtersButton = this.main.getByRole("button", { name: this.t.Listing.filters });
  readonly products = this.main.getByRole("article");
  readonly emptyState = this.main.getByText(this.t.Listing.empty);
  readonly clearFilters = this.main.getByRole("link", { name: this.t.Listing.clearFilters });
  readonly pagination = this.main.getByRole("navigation", { name: this.t.Pagination.label });

  filterOption(label: string) {
    return this.page.getByRole("checkbox", { name: new RegExp(`^${escapeRegExp(label)} \\(\\d+\\)$`) });
  }

  async sortBy(label: string): Promise<void> {
    await this.sort.click();
    await this.page.getByRole("option", { name: label, exact: true }).click();
  }

  productNames() {
    return this.products.getByRole("link").allTextContents();
  }
}
