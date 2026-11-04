"use client";

import { ShoppingCartIcon, TriangleAlertIcon, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { FormAlert } from "@/components/form/form-alert";
import { EmptyState } from "@/components/layout/empty-state";
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
      <div aria-busy="true" aria-label={t("loading")} className="grid gap-8 lg:grid-cols-[1fr_22rem] lg:items-start">
        <div className="grid gap-6">
          <Skeleton className="h-56 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
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
    return <CartNotice icon={ShoppingCartIcon} message={error ? errorMessage(error) : t("emptyCart")} />;
  }
  if (cart.has_issues) {
    return <CartNotice icon={TriangleAlertIcon} message={t("cartIssues")} />;
  }
  return <CheckoutForm provinces={provinces} pickupPoints={pickupPoints} onPlaced={() => setPlaced(true)} />;
}

function CartNotice({ icon, message }: { icon: LucideIcon; message: string }) {
  const t = useTranslations("Checkout");
  return (
    <EmptyState
      icon={icon}
      description={message}
      action={
        <Button asChild size="lg">
          <Link href={CART_PATH}>{t("backToCart")}</Link>
        </Button>
      }
    />
  );
}
