import { getLocale, getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getAttributes, getBrands, getFacets, searchProducts } from "@/features/catalog/api";
import { ListingFilters } from "@/features/catalog/components/listing-filters";
import { ListingProvider, ListingResults } from "@/features/catalog/components/listing-provider";
import { MobileFilters } from "@/features/catalog/components/mobile-filters";
import { Pagination } from "@/features/catalog/components/pagination";
import { ProductGrid, ProductGridSkeleton } from "@/features/catalog/components/product-grid";
import { SortSelect } from "@/features/catalog/components/sort-select";
import { filterGroups } from "@/features/catalog/filters";
import {
  knownFilters,
  serializeCatalogSearchParams,
  toFilterQuery,
  toProductQuery,
  type CatalogSearchState,
} from "@/features/catalog/search-params";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getCurrency } from "@/lib/currency.server";

const SKELETON_CARDS = 8;

export async function ProductListing({
  state,
  path,
  category,
}: {
  state: CatalogSearchState;
  path: string;
  category?: string;
}) {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("Listing");
  const currency = await getCurrency();
  const [brands, attributes] = await Promise.all([getBrands(), getAttributes(locale)]);
  const context = { locale, currency, category, known: knownFilters(brands, attributes) };
  const [results, facets] = await Promise.all([
    searchProducts(toProductQuery(state, context)),
    getFacets(toFilterQuery(state, context)),
  ]);
  const filters = (
    <ListingFilters
      groups={filterGroups(facets, state, brands, attributes)}
      priceRange={facets.price}
      currency={currency}
    />
  );

  return (
    <ListingProvider>
      <div className="grid gap-6 lg:grid-cols-[15rem_1fr]">
        <aside aria-label={t("filters")} className="hidden lg:block">
          {filters}
        </aside>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p role="status" className="text-sm text-muted-foreground">
              {t("count", { count: results.total })}
            </p>
            <div className="flex items-center gap-2">
              <MobileFilters>{filters}</MobileFilters>
              <SortSelect hasQuery={Boolean(state.q)} />
            </div>
          </div>
          <ListingResults>
            {results.items.length > 0 ? (
              <ProductGrid products={results.items} />
            ) : (
              <div className="flex flex-col items-start gap-3 rounded-xl border p-6">
                <p>{t("empty")}</p>
                <Button asChild variant="outline" size="sm">
                  <Link href={serializeCatalogSearchParams(path, { q: state.q })}>{t("clearFilters")}</Link>
                </Button>
              </div>
            )}
          </ListingResults>
          <Pagination page={results.page} pages={results.pages} path={path} state={state} />
        </div>
      </div>
    </ListingProvider>
  );
}

export function ProductListingSkeleton() {
  return (
    <div aria-hidden="true" className="grid gap-6 lg:grid-cols-[15rem_1fr]">
      <div className="hidden gap-3 lg:grid lg:content-start">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-5 w-3/4" />
        ))}
      </div>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-5 w-32" />
        <ProductGridSkeleton count={SKELETON_CARDS} />
      </div>
    </div>
  );
}
