import type { Locale } from "@/i18n/locales";
import type { components } from "@/lib/api/schema";

export type Money = components["schemas"]["Money"];

const INTL_LOCALES: Record<Locale, string> = { es: "es-AR", en: "en-US" };

export function formatMoney(money: Money, locale: Locale): string {
  const digits = money.currency === "ARS" ? 0 : 2;
  return new Intl.NumberFormat(INTL_LOCALES[locale], {
    style: "currency",
    currency: money.currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(money.amount as Intl.StringNumericLiteral);
}
