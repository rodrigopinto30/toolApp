"use client";

import { useTranslations } from "next-intl";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { CartLine } from "@/features/cart/types";
import type { CartAdjustment } from "@/stores/guest-cart";
import { useGuestCart } from "@/stores/store-provider";

export function MergeNotice({ lines }: { lines: CartLine[] }) {
  const t = useTranslations("Cart.merged");
  const adjustments = useGuestCart((state) => state.adjustments);
  const setAdjustments = useGuestCart((state) => state.setAdjustments);

  if (adjustments.length === 0) {
    return null;
  }

  const describe = (adjustment: CartAdjustment) => {
    if (adjustment.reason !== "insufficient_stock") {
      return t(adjustment.reason);
    }
    const line = lines.find((candidate) => candidate.variant_id === adjustment.variant_id);
    return t("insufficient_stock", {
      name: line?.product_name ?? t("unknownProduct"),
      applied: adjustment.applied,
      requested: adjustment.requested,
    });
  };

  return (
    <Alert role="status">
      <AlertTitle>{t("title")}</AlertTitle>
      <AlertDescription className="grid gap-3">
        <ul className="list-disc pl-5">
          {adjustments.map((adjustment) => (
            <li key={adjustment.variant_id}>{describe(adjustment)}</li>
          ))}
        </ul>
        <Button variant="outline" size="sm" className="justify-self-start" onClick={() => setAdjustments([])}>
          {t("dismiss")}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
