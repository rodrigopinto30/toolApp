import { cn } from "cn";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { pageItems } from "@/features/catalog/pagination";
import { serializeCatalogSearchParams, type CatalogSearchState } from "@/features/catalog/search-params";
import { Link } from "@/i18n/navigation";

export function Pagination({
  page,
  pages,
  path,
  state,
}: {
  page: number;
  pages: number;
  path: string;
  state: CatalogSearchState;
}) {
  const t = useTranslations("Listing");

  if (pages <= 1) {
    return null;
  }
  const href = (target: number) => serializeCatalogSearchParams(path, { ...state, page: target });

  return (
    <nav aria-label={t("pagination")} className="flex flex-wrap items-center justify-center gap-1">
      {page > 1 && (
        <Button asChild variant="ghost" size="sm">
          <Link href={href(page - 1)} rel="prev">
            <ChevronLeftIcon aria-hidden="true" />
            {t("previous")}
          </Link>
        </Button>
      )}
      {pageItems(page, pages).map((item, index) =>
        item === "gap" ? (
          <span key={`gap-${index}`} aria-hidden="true" className="px-2 text-muted-foreground">
            …
          </span>
        ) : (
          <Button key={item} asChild variant={item === page ? "outline" : "ghost"} size="sm">
            <Link
              href={href(item)}
              aria-label={t("page", { page: item })}
              aria-current={item === page ? "page" : undefined}
              className={cn(item === page && "pointer-events-none")}
            >
              {item}
            </Link>
          </Button>
        ),
      )}
      {page < pages && (
        <Button asChild variant="ghost" size="sm">
          <Link href={href(page + 1)} rel="next">
            {t("next")}
            <ChevronRightIcon aria-hidden="true" />
          </Link>
        </Button>
      )}
    </nav>
  );
}
