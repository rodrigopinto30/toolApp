"use client";

import { useLocale, useTranslations } from "next-intl";

import type { Locale } from "@/i18n/locales";
import { ApiError } from "@/lib/api/errors";
import { formatMoney, type Money } from "@/lib/money";

export function useErrorMessage() {
  const t = useTranslations("Errors");
  const locale = useLocale() as Locale;

  return (error: unknown): string => {
    if (!(error instanceof ApiError)) {
      return t("unexpected");
    }
    const minutes = Math.max(1, Math.ceil((error.retryAfter ?? 60) / 60));
    switch (error.code) {
      case "invalid_credentials":
      case "account_disabled":
      case "invalid_token":
      case "invalid_current_password":
      case "csrf_failed":
      case "network_error":
      case "timeout":
      case "validation_error":
        return t(error.code);
      case "account_locked":
      case "rate_limited":
        return t(error.code, { minutes });
      case "service_unavailable":
      case "auth_unavailable":
        return t("service_unavailable");
      case "cart_limit":
      case "not_found":
      case "cart_empty":
      case "cart_has_issues":
      case "coupon_not_found":
      case "coupon_not_started":
      case "coupon_expired":
      case "coupon_exhausted":
      case "coupon_limit_reached":
      case "shipping_unavailable":
      case "total_changed":
      case "payment_rejected":
      case "payment_unavailable":
      case "email_not_verified":
      case "exchange_rate_unavailable":
      case "limit_reached":
      case "unknown_province":
      case "invalid_tax_id":
        return t(error.code);
      case "coupon_min_subtotal": {
        const minimum = moneyDetail(error.details, "min_subtotal");
        return minimum
          ? t("coupon_min_subtotal", { amount: formatMoney(minimum, locale) })
          : t("coupon_min_subtotal_unknown");
      }
      case "insufficient_stock": {
        const available = availableUnits(error.details);
        return available === undefined ? t("insufficient_stock_unknown") : t("insufficient_stock", { available });
      }
      default:
        return error.requestId ? t("unexpectedWithId", { requestId: error.requestId }) : t("unexpected");
    }
  };
}

function moneyDetail(details: unknown, key: string): Money | undefined {
  if (typeof details !== "object" || details === null || !(key in details)) {
    return undefined;
  }
  const value = (details as Record<string, unknown>)[key];
  const valid =
    typeof value === "object" &&
    value !== null &&
    "amount" in value &&
    typeof value.amount === "string" &&
    "currency" in value &&
    (value.currency === "ARS" || value.currency === "USD");
  return valid ? (value as Money) : undefined;
}

function availableUnits(details: unknown): number | undefined {
  if (typeof details !== "object" || details === null || !("available" in details)) {
    return undefined;
  }
  return typeof details.available === "number" ? details.available : undefined;
}

export function invalidFields(error: unknown): string[] {
  if (!(error instanceof ApiError) || error.code !== "validation_error" || !Array.isArray(error.details)) {
    return [];
  }
  return error.details.flatMap((detail: unknown) => {
    if (typeof detail !== "object" || detail === null || !("loc" in detail) || !Array.isArray(detail.loc)) {
      return [];
    }
    const [source, field] = detail.loc;
    return source === "body" && typeof field === "string" ? [field] : [];
  });
}
