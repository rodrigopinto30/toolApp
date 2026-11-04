"use client";

import { ShoppingCartIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";

import { FormAlert } from "@/components/form/form-alert";
import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CartLineItem } from "@/features/cart/components/cart-line-item";
import { CartSummary } from "@/features/cart/components/cart-summary";
import { MergeNotice } from "@/features/cart/components/merge-notice";
import { useCart } from "@/features/cart/hooks";
import type { Cart } from "@/features/cart/types";
import { ShippingQuote, type ProvinceOption } from "@/features/catalog/components/shipping-quote";
import { useErrorMessage } from "@/features/errors/use-error-message";
import { Link } from "@/i18n/navigation";

export function CartView({ provinces }: { provinces: ProvinceOption[] }) {
  const t = useTranslations("Cart");
  const errorMessage = useErrorMessage();
  const { cart, isGuest, isEmpty, isUpdating, error } = useCart();

  return (
    <div className="grid gap-6">
      <MergeNotice lines={cart?.items ?? []} />
      {error ? <FormAlert message={errorMessage(error)} /> : null}
      {isEmpty ? (
        <EmptyCart />
      ) : cart ? (
        <div className="grid gap-8 lg:grid-cols-[1fr_20rem] lg:items-start">
          <section aria-label={t("lines")} aria-busy={isUpdating} className="rounded-xl border bg-card px-4 shadow-xs">
            <ul className="divide-y">
              {cart.items.map((line) => (
                <CartLineItem key={line.variant_id} line={line} />
              ))}
            </ul>
          </section>
          <div className="grid gap-6">
            <CartSummary cart={cart} isGuest={isGuest} />
            <CartShipping cart={cart} provinces={provinces} />
          </div>
        </div>
      ) : (
        !error && <CartSkeleton />
      )}
    </div>
  );
}

function CartShipping({ cart, provinces }: { cart: Cart; provinces: ProvinceOption[] }) {
  const t = useTranslations("Cart");
  const headingId = useId();
  const items = cart.items
    .filter((line) => line.issue !== "unavailable")
    .map((line) => ({ variant_id: line.variant_id, quantity: line.quantity }));

  if (items.length === 0) {
    return null;
  }
  return (
    <section aria-labelledby={headingId} className="grid gap-4 rounded-xl border bg-card p-4 shadow-xs">
      <h2 id={headingId} className="text-lg font-semibold">
        {t("shipping")}
      </h2>
      <ShippingQuote items={() => items} provinces={provinces} />
    </section>
  );
}

function EmptyCart() {
  const t = useTranslations("Cart.empty");
  return (
    <EmptyState
      icon={ShoppingCartIcon}
      title={t("title")}
      description={t("body")}
      action={
        <Button asChild size="lg">
          <Link href="/">{t("cta")}</Link>
        </Button>
      }
    />
  );
}

function CartSkeleton() {
  const t = useTranslations("Cart");
  return (
    <div aria-busy="true" aria-label={t("loading")} className="grid gap-8 lg:grid-cols-[1fr_20rem] lg:items-start">
      <div className="grid gap-4 rounded-xl border bg-card p-4 shadow-xs">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  );
}
