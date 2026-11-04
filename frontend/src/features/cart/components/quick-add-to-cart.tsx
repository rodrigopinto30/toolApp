"use client";

import { CheckIcon, ShoppingCartIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { useAddToCart } from "@/features/cart/hooks";

const ADDED_FOR_MS = 2500;

export function QuickAddToCart({ variantId, name }: { variantId: number; name: string }) {
  const t = useTranslations("QuickAdd");
  const addToCart = useAddToCart();
  const { isSuccess, isError, isPending, reset } = addToCart;
  const label = isPending ? t("adding") : isSuccess ? t("added") : t("add");

  useEffect(() => {
    if (!isSuccess) {
      return;
    }
    const timer = setTimeout(reset, ADDED_FOR_MS);
    return () => clearTimeout(timer);
  }, [isSuccess, reset]);

  return (
    <div className="relative z-10 grid gap-1">
      <Button
        type="button"
        size="lg"
        disabled={isPending}
        aria-label={`${label}: ${name}`}
        className="w-full"
        onClick={() => addToCart.mutate({ variantId, quantity: 1 })}
      >
        {isSuccess ? <CheckIcon aria-hidden="true" /> : <ShoppingCartIcon aria-hidden="true" />}
        {isPending || isSuccess ? (
          label
        ) : (
          <>
            <span className="@[11rem]:hidden">{t("addShort")}</span>
            <span className="hidden @[11rem]:inline">{t("add")}</span>
          </>
        )}
      </Button>
      <p aria-live="polite" className={isError ? "text-xs text-destructive" : "sr-only"}>
        {isSuccess && t("addedStatus", { name })}
        {isError && t("error")}
      </p>
    </div>
  );
}
