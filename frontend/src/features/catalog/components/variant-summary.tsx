"use client";

import { useTranslations } from "next-intl";

import { DiscountBadge } from "@/features/catalog/components/discount-badge";
import { Price } from "@/features/catalog/components/price";
import { StockBadge } from "@/features/catalog/components/stock-badge";
import { discountPercent } from "@/features/catalog/discount";
import { useSelectedVariant } from "@/features/catalog/use-selected-variant";
import type { Variant } from "@/features/catalog/variants";

export function VariantSummary({ variants }: { variants: Variant[] }) {
  const t = useTranslations("Product");
  const [variant] = useSelectedVariant(variants);
  const discount = discountPercent(variant.price, variant.compare_at);

  return (
    <div aria-live="polite" className="grid gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <Price
          price={variant.price}
          compareAt={variant.compare_at}
          className="text-lg"
          amountClassName="font-heading text-3xl font-bold"
        />
        {discount !== null && <DiscountBadge percent={discount} />}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <StockBadge status={variant.stock_status} />
        <span>{t("sku", { sku: variant.sku })}</span>
      </div>
    </div>
  );
}
