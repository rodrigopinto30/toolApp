"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { FormAlert } from "@/components/form/form-alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { VerificationBanner } from "@/features/account/components/verification-banner";
import { useCart } from "@/features/cart/hooks";
import { CART_PATH } from "@/features/cart/paths";
import type { PickupPoint } from "@/features/catalog/components/pickup-point-details";
import type { ProvinceOption } from "@/features/catalog/components/shipping-quote";
import { CheckoutForm } from "@/features/checkout/components/checkout-form";
import { useErrorMessage } from "@/features/errors/use-error-message";
import { useProtectedMe } from "@/features/session/use-protected-me";
import { Link } from "@/i18n/navigation";

export function CheckoutView({
  provinces,
  pickupPoints,
}: {
  provinces: ProvinceOption[];
  pickupPoints: PickupPoint[];
}) {
  const t = useTranslations("Checkout");
  const errorMessage = useErrorMessage();
  const { me, unauthenticated } = useProtectedMe();
  const { cart, isEmpty, isLoading, error } = useCart();
  const [placed, setPlaced] = useState(false);

  if (placed) {
    return <p role="status">{t("placed")}</p>;
  }
  if (me.error && !unauthenticated) {
    return <FormAlert message={errorMessage(me.error)} />;
  }
  if (!me.data || isLoading) {
    return (
      <div aria-busy="true" aria-label={t("loading")} className="grid gap-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (!me.data.email_verified) {
    return (
      <div className="grid gap-4">
        <p>{t("verify")}</p>
        <VerificationBanner />
      </div>
    );
  }
  if (isEmpty || !cart) {
    return <CartNotice message={error ? errorMessage(error) : t("emptyCart")} />;
  }
  if (cart.has_issues) {
    return <CartNotice message={t("cartIssues")} />;
  }
  return <CheckoutForm provinces={provinces} pickupPoints={pickupPoints} onPlaced={() => setPlaced(true)} />;
}

function CartNotice({ message }: { message: string }) {
  const t = useTranslations("Checkout");
  return (
    <div className="grid justify-items-start gap-3">
      <p>{message}</p>
      <Button asChild variant="outline">
        <Link href={CART_PATH}>{t("backToCart")}</Link>
      </Button>
    </div>
  );
}
