"use client";

import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useId } from "react";

import { addressLine } from "@/features/account/address-line";
import { PickupPointDetails } from "@/features/catalog/components/pickup-point-details";
import { TotalsList } from "@/features/checkout/components/totals-list";
import type { Order } from "@/features/orders/types";
import type { Locale } from "@/i18n/locales";
import { formatMoney } from "@/lib/money";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="grid gap-3 rounded-lg border p-4">
      <h2 id={headingId} className="text-base font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function OrderItems({ order }: { order: Order }) {
  const t = useTranslations("Orders.detail");
  const locale = useLocale() as Locale;
  return (
    <Section title={t("items")}>
      <ul className="grid gap-2 text-sm">
        {order.items.map((item) => (
          <li key={item.variant_id} className="flex justify-between gap-4">
            <span>
              {item.quantity} × {item.product_name}
              {item.variant_label && <span className="text-muted-foreground"> ({item.variant_label})</span>}
            </span>
            <span className="tabular-nums">{formatMoney(item.line_total, locale)}</span>
          </li>
        ))}
      </ul>
      <div className="border-t pt-3">
        <TotalsList
          subtotal={order.subtotal}
          discount={order.discount_total}
          shipping={order.shipping_total}
          total={order.total}
          couponCode={order.coupon?.code}
          freeShipping={Number(order.shipping_total.amount) === 0}
        />
      </div>
    </Section>
  );
}

export function OrderDelivery({ order }: { order: Order }) {
  const t = useTranslations("Orders.delivery");
  const { address, zone, pickup_point: pickupPoint, method } = order.delivery;
  return (
    <Section title={t("title")}>
      <div className="grid gap-1 text-sm">
        <p className="font-medium">{t(method)}</p>
        {address && (
          <>
            <p className="text-muted-foreground">{address.recipient_name}</p>
            <p className="text-muted-foreground">{addressLine(address)}</p>
          </>
        )}
        {zone && <p className="text-muted-foreground">{t("eta", { min: zone.eta_min_days, max: zone.eta_max_days })}</p>}
        {pickupPoint && <PickupPointDetails point={pickupPoint} />}
      </div>
    </Section>
  );
}

export function OrderBillingDetails({ order }: { order: Order }) {
  const t = useTranslations("Orders.billing");
  const conditions = useTranslations("BillingForm.conditions");
  const { billing } = order;
  return (
    <Section title={t("title")}>
      {billing ? (
        <div className="grid gap-1 text-sm">
          <p className="font-medium">{billing.legal_name}</p>
          <p className="text-muted-foreground">
            {billing.tax_id_type} {billing.tax_id} · {conditions(billing.tax_condition)}
          </p>
          <p className="text-muted-foreground">{billing.fiscal_address}</p>
        </div>
      ) : (
        <p className="text-sm">{t("finalConsumer")}</p>
      )}
    </Section>
  );
}

export function isKnownNote(note: string | null): note is "payment_rejected" | "cancelled_by_customer" | "expired" {
  return note === "payment_rejected" || note === "cancelled_by_customer" || note === "expired";
}

export function OrderHistory({ order }: { order: Order }) {
  const t = useTranslations("Orders");
  const format = useFormatter();
  return (
    <Section title={t("history.title")}>
      <ol className="grid gap-2 text-sm">
        {order.status_history.map((change) => (
          <li key={`${change.to_status}-${change.created_at}`} className="grid gap-0.5">
            <span className="font-medium">{t(`status.${change.to_status}`)}</span>
            <span className="text-muted-foreground">
              {format.dateTime(new Date(change.created_at), { dateStyle: "medium", timeStyle: "short" })}
              {isKnownNote(change.note) && ` · ${t(`history.notes.${change.note}`)}`}
            </span>
          </li>
        ))}
      </ol>
    </Section>
  );
}

export function OrderPayments({ order }: { order: Order }) {
  const t = useTranslations("Orders.payments");
  const locale = useLocale() as Locale;
  if (order.payments.length === 0) {
    return null;
  }
  return (
    <Section title={t("title")}>
      <ul className="grid gap-2 text-sm">
        {order.payments.map((payment) => (
          <li key={payment.created_at} className="flex flex-wrap justify-between gap-2">
            <span>
              {order.status === "cancelled" && payment.status === "pending"
                ? t("notCompleted")
                : t(`status.${payment.status}`)}
              {payment.brand && payment.last4 && (
                <span className="text-muted-foreground">
                  {" "}
                  · {t("card", { brand: payment.brand, last4: payment.last4 })}
                </span>
              )}
            </span>
            <span className="tabular-nums">{formatMoney(payment.amount, locale)}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}
