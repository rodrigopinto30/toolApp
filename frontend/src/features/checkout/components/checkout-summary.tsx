"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId } from "react";

import { FormAlert } from "@/components/form/form-alert";
import { Skeleton } from "@/components/ui/skeleton";
import type { CheckoutPreview } from "@/features/checkout/types";
import { useErrorMessage } from "@/features/errors/use-error-message";
import type { Locale } from "@/i18n/locales";
import { formatMoney } from "@/lib/money";

export function CheckoutSummary({
  preview,
  error,
  isUpdating,
  hasDelivery,
}: {
  preview: CheckoutPreview | undefined;
  error: unknown;
  isUpdating: boolean;
  hasDelivery: boolean;
}) {
  const t = useTranslations("Checkout.summary");
  const locale = useLocale() as Locale;
  const headingId = useId();
  const errorMessage = useErrorMessage();

  return (
    <section
      aria-labelledby={headingId}
      aria-busy={isUpdating}
      className="grid gap-4 rounded-lg border p-4 lg:sticky lg:top-4"
    >
      <h2 id={headingId} className="text-lg font-semibold">
        {t("title")}
      </h2>
      {!hasDelivery ? (
        <p className="text-sm text-muted-foreground">{t("chooseDelivery")}</p>
      ) : error && !preview ? (
        <FormAlert message={errorMessage(error)} />
      ) : !preview ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <>
          <ul className="grid gap-2 text-sm">
            {preview.items.map((line) => (
              <li key={line.variant_id} className="flex justify-between gap-4">
                <span>
                  {line.quantity} × {line.product_name}
                  {line.variant_label && <span className="text-muted-foreground"> ({line.variant_label})</span>}
                </span>
                <span className="tabular-nums">{formatMoney(line.line_total, locale)}</span>
              </li>
            ))}
          </ul>
          <dl className="grid gap-2 border-t pt-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt>{t("subtotal")}</dt>
              <dd className="tabular-nums">{formatMoney(preview.subtotal, locale)}</dd>
            </div>
            {preview.coupon && Number(preview.discount_total.amount) > 0 && (
              <div className="flex justify-between gap-4">
                <dt>{t("discount", { code: preview.coupon.code })}</dt>
                <dd className="tabular-nums">-{formatMoney(preview.discount_total, locale)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <dt>{t("shipping")}</dt>
              <dd className="tabular-nums">
                {preview.delivery.is_free ? t("free") : formatMoney(preview.shipping_total, locale)}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-t pt-2 text-base font-semibold">
              <dt>{t("total")}</dt>
              <dd aria-live="polite" className="tabular-nums">
                {formatMoney(preview.total, locale)}
              </dd>
            </div>
          </dl>
          <p className="text-sm text-muted-foreground">
            {preview.delivery.pickup_point
              ? t("pickupAt", { name: preview.delivery.pickup_point.name })
              : t("eta", { min: preview.delivery.eta_min_days, max: preview.delivery.eta_max_days })}
          </p>
          {error ? <FormAlert message={errorMessage(error)} /> : null}
          {isUpdating && <p className="sr-only">{t("updating")}</p>}
        </>
      )}
    </section>
  );
}
