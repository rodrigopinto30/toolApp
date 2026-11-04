import { cn } from "cn";
import { useLocale, useTranslations } from "next-intl";

import { formatMoney, type Money } from "@/lib/money";

export function Price({
  price,
  compareAt,
  varies = false,
  className,
  amountClassName,
}: {
  price: Money;
  compareAt?: Money | null;
  varies?: boolean;
  className?: string;
  amountClassName?: string;
}) {
  const t = useTranslations("Catalog.price");
  const locale = useLocale();
  const amount = formatMoney(price, locale);

  return (
    <p className={cn("flex flex-wrap items-baseline gap-x-2", className)}>
      <span className={cn("font-semibold", amountClassName)}>{varies ? t("from", { price: amount }) : amount}</span>
      {compareAt && (
        <s className="text-sm text-muted-foreground">
          <span className="sr-only">{t("before")} </span>
          {formatMoney(compareAt, locale)}
        </s>
      )}
    </p>
  );
}
