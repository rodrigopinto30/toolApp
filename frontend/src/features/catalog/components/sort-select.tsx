"use client";

import { useTranslations } from "next-intl";
import { useQueryStates } from "nuqs";
import { useId } from "react";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useListing } from "@/features/catalog/components/listing-provider";
import { catalogSearchParams, PRODUCT_SORTS } from "@/features/catalog/search-params";

export function SortSelect({ hasQuery }: { hasQuery: boolean }) {
  const t = useTranslations("Listing");
  const id = useId();
  const { startTransition } = useListing();
  const [{ sort }, setState] = useQueryStates(
    { sort: catalogSearchParams.sort, page: catalogSearchParams.page },
    { history: "push", shallow: false, scroll: false, startTransition },
  );
  const fallback = hasQuery ? "relevance" : "newest";
  const options = PRODUCT_SORTS.filter((option) => hasQuery || option !== "relevance");
  const current = options.find((option) => option === sort) ?? fallback;

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor={id} className="font-normal whitespace-nowrap text-muted-foreground">
        {t("sort")}
      </Label>
      <Select
        value={current}
        onValueChange={(value) => {
          const next = options.find((option) => option === value) ?? fallback;
          void setState({ sort: next === fallback ? null : next, page: null });
        }}
      >
        <SelectTrigger id={id} size="sm">
          <SelectValue>{t(`sorts.${current}`)}</SelectValue>
        </SelectTrigger>
        <SelectContent position="popper" align="end">
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {t(`sorts.${option}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
