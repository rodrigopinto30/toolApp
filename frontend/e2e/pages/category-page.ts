import type { Page } from "@playwright/test";

import { categoryPath } from "../../src/features/catalog/paths";
import type { Locale } from "../support/i18n";
import { ListingPage } from "./listing-page";

export class CategoryPage extends ListingPage {
  readonly breadcrumbs = this.main.getByRole("navigation", { name: this.t.Breadcrumbs.label });
  readonly subcategories = this.main.getByRole("navigation", { name: this.t.Category.subcategories });
  protected readonly path: string;

  constructor(page: Page, slug: string, locale: Locale = "es") {
    super(page, locale);
    this.path = categoryPath(slug);
  }
}
