"use client";

import { useTranslations } from "next-intl";

import { Price } from "@/features/catalog/components/price";
import { StockBadge } from "@/features/catalog/components/stock-badge";
import { useSelectedVariant } from "@/features/catalog/use-selected-variant";
import type { Variant } from "@/features/catalog/variants";

export function VariantSummary({ variants }: { variants: Variant[] }) {
  const t = useTranslations("Product");
  const [variant] = useSelectedVariant(variants);

  return (
    <div aria-live="polite" className="grid gap-2">
      <Price price={variant.price} compareAt={variant.compare_at} className="text-2xl" />
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <StockBadge status={variant.stock_status} />
        <span>{t("sku", { sku: variant.sku })}</span>
      </div>
    </div>
  );
}
