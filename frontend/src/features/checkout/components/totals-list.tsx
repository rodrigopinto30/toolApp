"use client";

import { useLocale, useTranslations } from "next-intl";

import type { Locale } from "@/i18n/locales";
import { formatMoney, type Money } from "@/lib/money";

export function TotalsList({
  subtotal,
  discount,
  shipping,
  total,
  couponCode,
  freeShipping,
}: {
  subtotal: Money;
  discount: Money;
  shipping: Money;
  total: Money;
  couponCode: string | undefined;
  freeShipping: boolean;
}) {
  const t = useTranslations("Checkout.summary");
  const locale = useLocale() as Locale;

  return (
    <dl className="grid gap-2 text-sm">
      <div className="flex justify-between gap-4">
        <dt>{t("subtotal")}</dt>
        <dd className="tabular-nums">{formatMoney(subtotal, locale)}</dd>
      </div>
      {couponCode && Number(discount.amount) > 0 && (
        <div className="flex justify-between gap-4">
          <dt>{t("discount", { code: couponCode })}</dt>
          <dd className="tabular-nums">-{formatMoney(discount, locale)}</dd>
        </div>
      )}
      <div className="flex justify-between gap-4">
        <dt>{t("shipping")}</dt>
        <dd className="tabular-nums">{freeShipping ? t("free") : formatMoney(shipping, locale)}</dd>
      </div>
      <div className="flex justify-between gap-4 border-t pt-2 text-base font-semibold">
        <dt>{t("total")}</dt>
        <dd aria-live="polite" className="tabular-nums">
          {formatMoney(total, locale)}
        </dd>
      </div>
    </dl>
  );
}
