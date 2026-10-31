"use client";

import { useTranslations } from "next-intl";
import { parseAsInteger, useQueryState } from "nuqs";
import { useEffect } from "react";

import { FormAlert } from "@/components/form/form-alert";
import { Pagination } from "@/components/layout/pagination";
import { Button } from "@/components/ui/button";
import { FAVORITES_PATH } from "@/features/account/paths";
import { ProductGrid, ProductGridSkeleton } from "@/features/catalog/components/product-grid";
import { useErrorMessage } from "@/features/errors/use-error-message";
import { useFavorites } from "@/features/favorites/hooks";
import { useProtectedMe } from "@/features/session/use-protected-me";
import { Link } from "@/i18n/navigation";

const MAX_PAGE = 1000;
const SKELETON_CARDS = 4;

export function FavoritesView() {
  const t = useTranslations("Favorites");
  const errorMessage = useErrorMessage();
  useProtectedMe();
  const [requested, setPage] = useQueryState("page", parseAsInteger.withDefault(1));
  const page = Math.min(Math.max(requested, 1), MAX_PAGE);
  const favorites = useFavorites(page);
  const lastPage = favorites.data?.pages ?? 0;

  useEffect(() => {
    if (lastPage > 0 && page > lastPage) {
      void setPage(lastPage);
    }
  }, [lastPage, page, setPage]);

  if (favorites.error) {
    return <FormAlert message={errorMessage(favorites.error)} />;
  }
  if (!favorites.data) {
    return (
      <div aria-busy="true" aria-label={t("loading")}>
        <ProductGridSkeleton count={SKELETON_CARDS} />
      </div>
    );
  }
  if (favorites.data.total === 0) {
    return (
      <div className="grid justify-items-center gap-3 rounded-lg border border-dashed px-4 py-12 text-center">
        <p className="text-lg font-semibold">{t("empty.title")}</p>
        <Button asChild variant="outline">
          <Link href="/">{t("empty.cta")}</Link>
        </Button>
      </div>
    );
  }
  return (
    <div className="grid gap-4">
      <ProductGrid products={favorites.data.items} />
      <Pagination
        page={favorites.data.page}
        pages={favorites.data.pages}
        href={(target) => (target === 1 ? FAVORITES_PATH : `${FAVORITES_PATH}?page=${target}`)}
      />
    </div>
  );
}
