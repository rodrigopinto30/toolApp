"use client";

import { cn } from "cn";
import { Trash2Icon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId } from "react";

import { QuantityStepper } from "@/components/form/quantity-stepper";
import { Button } from "@/components/ui/button";
import { useUpdateCartLine } from "@/features/cart/hooks";
import type { CartLine } from "@/features/cart/types";
import { ProductImage } from "@/features/catalog/components/product-image";
import { productPath } from "@/features/catalog/paths";
import { VARIANT_PARAM } from "@/features/catalog/use-selected-variant";
import { useErrorMessage } from "@/features/errors/use-error-message";
import type { Locale } from "@/i18n/locales";
import { Link } from "@/i18n/navigation";
import { formatMoney } from "@/lib/money";
import { MAX_LINE_QUANTITY } from "@/stores/guest-cart";

export function CartLineItem({ line }: { line: CartLine }) {
  const t = useTranslations("Cart");
  const locale = useLocale() as Locale;
  const errorMessage = useErrorMessage();
  const id = useId();
  const update = useUpdateCartLine();
  const change = (quantity: number) => update.mutate({ variantId: line.variant_id, quantity });
  const href = { pathname: productPath(line.product_slug), query: { [VARIANT_PARAM]: line.sku } };

  return (
    <li
      aria-busy={update.isPending}
      className={cn(
        "grid grid-cols-[5rem_1fr] gap-4 py-4 sm:grid-cols-[6rem_1fr_auto]",
        update.isPending && "opacity-60",
      )}
    >
      <ProductImage image={line.image} sizes="6rem" />
      <div className="grid content-start gap-1">
        <Link href={href} className="font-medium hover:underline">
          {line.product_name}
        </Link>
        {line.variant_label && <p className="text-sm text-muted-foreground">{line.variant_label}</p>}
        <p className="text-sm text-muted-foreground">
          {t("unitPrice", { price: formatMoney(line.unit_price, locale) })}
        </p>
        <LineIssue line={line} disabled={update.isPending} onFix={change} />
        {update.error && (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage(update.error)}
          </p>
        )}
      </div>
      <div className="col-span-2 flex flex-wrap items-center justify-between gap-3 sm:col-span-1 sm:flex-col sm:items-end">
        <QuantityStepper
          id={`${id}-quantity`}
          label={t("quantityOf", { name: line.product_name })}
          hideLabel
          decreaseLabel={t("decrease")}
          increaseLabel={t("increase")}
          value={line.quantity}
          max={MAX_LINE_QUANTITY}
          disabled={update.isPending || line.issue === "unavailable"}
          onValueChange={change}
        />
        <p className="font-medium tabular-nums">{formatMoney(line.line_total, locale)}</p>
        <Button
          variant="ghost"
          size="sm"
          aria-label={t("remove", { name: line.product_name })}
          disabled={update.isPending}
          onClick={() => change(0)}
        >
          <Trash2Icon aria-hidden="true" />
        </Button>
      </div>
    </li>
  );
}

function LineIssue({
  line,
  disabled,
  onFix,
}: {
  line: CartLine;
  disabled: boolean;
  onFix: (quantity: number) => void;
}) {
  const t = useTranslations("Cart");

  if (line.issue === null) {
    return null;
  }
  if (line.issue === "insufficient_stock" && line.available) {
    const available = line.available;
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm text-destructive">
        <p>{t("issues.insufficient_stock", { available })}</p>
        <Button variant="outline" size="sm" disabled={disabled} onClick={() => onFix(available)}>
          {t("useAvailable", { available })}
        </Button>
      </div>
    );
  }
  return <p className="text-sm text-destructive">{t(`issues.${line.issue}`)}</p>;
}
