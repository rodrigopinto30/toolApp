"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId } from "react";

import { FormAlert } from "@/components/form/form-alert";
import { Skeleton } from "@/components/ui/skeleton";
import { TotalsList } from "@/features/checkout/components/totals-list";
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
          <div className="border-t pt-3">
            <TotalsList
              subtotal={preview.subtotal}
              discount={preview.discount_total}
              shipping={preview.shipping_total}
              total={preview.total}
              couponCode={preview.coupon?.code}
              freeShipping={preview.delivery.is_free}
            />
          </div>
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
