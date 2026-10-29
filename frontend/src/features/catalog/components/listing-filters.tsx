"use client";

import { useTranslations } from "next-intl";
import { debounce, useQueryStates } from "nuqs";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useListing } from "@/features/catalog/components/listing-provider";
import type { FilterGroup } from "@/features/catalog/filters";
import { catalogSearchParams, isPriceInput } from "@/features/catalog/search-params";
import type { Currency } from "@/lib/currency";
import type { Money } from "@/lib/money";

const PRICE_DEBOUNCE_MS = 500;

export function ListingFilters({
  groups,
  priceRange,
  currency,
}: {
  groups: FilterGroup[];
  priceRange: { min: Money; max: Money } | null;
  currency: Currency;
}) {
  const t = useTranslations("Listing");
  const id = useId();
  const { startTransition } = useListing();
  const [state, setState] = useQueryStates(catalogSearchParams, { history: "push", shallow: false, scroll: false, startTransition });
  const hasFilters =
    state.brand.length > 0 || state.attr.length > 0 || state.min !== null || state.max !== null || state.stock;

  function toggle(group: FilterGroup, value: string, checked: boolean) {
    const current = state[group.param];
    void setState({
      [group.param]: checked ? [...current, value] : current.filter((selected) => selected !== value),
      page: null,
    });
  }

  function setPrice(key: "min" | "max", raw: string) {
    const value = raw.trim();
    if (isPriceInput(value)) {
      void setState({ [key]: value || null, page: null }, { limitUrlUpdates: debounce(PRICE_DEBOUNCE_MS) });
    }
  }

  return (
    <div className="grid gap-6">
      {groups.map((group) => (
        <fieldset key={group.key} className="grid gap-2">
          <legend className="mb-2 text-sm font-medium">{group.title ?? t("brand")}</legend>
          {group.options.map((option) => {
            const inputId = `${id}-${group.key}-${option.value}`;
            return (
              <div key={option.value} className="flex items-center gap-2">
                <Checkbox
                  id={inputId}
                  checked={state[group.param].includes(option.value)}
                  onCheckedChange={(checked) => toggle(group, option.value, checked === true)}
                />
                <Label htmlFor={inputId} className="font-normal">
                  {option.label} <span className="text-muted-foreground">({option.count})</span>
                </Label>
              </div>
            );
          })}
        </fieldset>
      ))}
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">{t("price", { currency })}</legend>
        <div className="grid grid-cols-2 gap-2">
          <Input
            inputMode="decimal"
            aria-label={t("minPrice")}
            placeholder={priceRange?.min.amount}
            value={state.min ?? ""}
            onChange={(event) => setPrice("min", event.target.value)}
          />
          <Input
            inputMode="decimal"
            aria-label={t("maxPrice")}
            placeholder={priceRange?.max.amount}
            value={state.max ?? ""}
            onChange={(event) => setPrice("max", event.target.value)}
          />
        </div>
      </fieldset>
      <div className="flex items-center gap-2">
        <Checkbox
          id={`${id}-stock`}
          checked={state.stock}
          onCheckedChange={(checked) => void setState({ stock: checked === true || null, page: null })}
        />
        <Label htmlFor={`${id}-stock`} className="font-normal">
          {t("inStock")}
        </Label>
      </div>
      {hasFilters && (
        <Button
          variant="outline"
          size="sm"
          className="justify-self-start"
          onClick={() => void setState({ brand: null, attr: null, min: null, max: null, stock: null, page: null })}
        >
          {t("clearFilters")}
        </Button>
      )}
    </div>
  );
}
