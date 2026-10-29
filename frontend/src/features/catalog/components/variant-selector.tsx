"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";

import { ChoiceChip } from "@/components/form/choice-chip";
import { useSelectedVariant } from "@/features/catalog/use-selected-variant";
import { chooseVariant, valueOf, variantOptions, type Variant } from "@/features/catalog/variants";

export function VariantSelector({ variants }: { variants: Variant[] }) {
  const t = useTranslations("Product");
  const id = useId();
  const [selected, select] = useSelectedVariant(variants);

  return (
    <div className="grid gap-4">
      {variantOptions(variants).map((option) => (
        <fieldset key={option.code} className="grid gap-2">
          <legend className="mb-2 text-sm font-medium">{option.name}</legend>
          <div className="flex flex-wrap gap-2">
            {option.values.map((value) => {
              const target = chooseVariant(variants, selected, option.code, value.slug);
              const outOfStock = target.stock_status === "out_of_stock";
              return (
                <ChoiceChip
                  key={value.slug}
                  name={`${id}-${option.code}`}
                  value={value.slug}
                  checked={valueOf(selected, option.code) === value.slug}
                  onChange={() => select(target)}
                  muted={outOfStock}
                  label={
                    <>
                      {value.label}
                      {outOfStock && <span className="sr-only"> ({t("outOfStock")})</span>}
                    </>
                  }
                />
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
