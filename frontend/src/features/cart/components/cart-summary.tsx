"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import { CHECKOUT_PATH } from "@/features/cart/paths";
import type { Cart } from "@/features/cart/types";
import type { Locale } from "@/i18n/locales";
import { Link } from "@/i18n/navigation";
import { formatMoney } from "@/lib/money";

export function CartSummary({ cart, isGuest }: { cart: Cart; isGuest: boolean }) {
  const t = useTranslations("Cart");
  const locale = useLocale() as Locale;
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="grid gap-4 rounded-lg border p-4">
      <h2 id={headingId} className="text-lg font-semibold">
        {t("summary.title")}
      </h2>
      <dl className="grid gap-2 text-sm">
        <div className="flex justify-between gap-4">
          <dt>
            {t("summary.subtotal")}{" "}
            <span className="text-muted-foreground">({t("summary.units", { count: cart.item_count })})</span>
          </dt>
          <dd className="font-medium tabular-nums">{formatMoney(cart.subtotal, locale)}</dd>
        </div>
      </dl>
      <p className="text-sm text-muted-foreground">{t("summary.note")}</p>
      {cart.has_issues && <p className="text-sm text-destructive">{t("summary.issues")}</p>}
      {isGuest ? (
        <Button asChild>
          <Link href={{ pathname: "/login", query: { next: `/${locale}${CHECKOUT_PATH}` } }}>
            {t("loginToCheckout")}
          </Link>
        </Button>
      ) : cart.has_issues ? (
        <Button disabled>{t("checkout")}</Button>
      ) : (
        <Button asChild>
          <Link href={CHECKOUT_PATH}>{t("checkout")}</Link>
        </Button>
      )}
    </section>
  );
}
