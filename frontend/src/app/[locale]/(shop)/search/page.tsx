import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";

import { ProductListing, ProductListingSkeleton } from "@/features/catalog/components/product-listing";
import { SEARCH_PATH } from "@/features/catalog/paths";
import { loadCatalogSearchParams, QUERY_MIN_LENGTH } from "@/features/catalog/search-params";
import type { Locale } from "@/i18n/routing";

type Props = PageProps<"/[locale]/search">;

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale } = await params;
  const { q } = await loadCatalogSearchParams(searchParams);
  const t = await getTranslations({ locale: locale as Locale, namespace: "Search" });
  return {
    title: q ? t("metaTitleWithQuery", { query: q }) : t("metaTitle"),
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations("Search");
  const state = await loadCatalogSearchParams(searchParams);
  const query = state.q ?? "";
  const searchable = query.length >= QUERY_MIN_LENGTH;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">
        {searchable ? t("resultsFor", { query }) : t("title")}
      </h1>
      {searchable ? (
        <Suspense fallback={<ProductListingSkeleton />}>
          <ProductListing state={state} path={SEARCH_PATH} />
        </Suspense>
      ) : (
        <p className="text-muted-foreground">{t("hint")}</p>
      )}
    </div>
  );
}
