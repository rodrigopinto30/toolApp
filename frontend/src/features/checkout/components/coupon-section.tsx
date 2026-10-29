"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApplyCoupon } from "@/features/checkout/hooks";
import type { CheckoutPreviewRequest } from "@/features/checkout/types";
import { useErrorMessage } from "@/features/errors/use-error-message";

export function CouponSection({
  base,
  coupon,
  error,
  onApplied,
  onRemoved,
}: {
  base: CheckoutPreviewRequest | null;
  coupon: string | null;
  error: unknown;
  onApplied: (code: string) => void;
  onRemoved: () => void;
}) {
  const t = useTranslations("Checkout.coupon");
  const id = useId();
  const errorMessage = useErrorMessage();
  const apply = useApplyCoupon();
  const [code, setCode] = useState("");
  const shownError = apply.error ?? error;
  const errorId = shownError ? `${id}-error` : undefined;

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = code.trim().toUpperCase();
    if (!normalized || !base) {
      return;
    }
    apply.mutate(
      { ...base, coupon_code: normalized },
      {
        onSuccess: () => {
          onApplied(normalized);
          setCode("");
        },
      },
    );
  };

  return (
    <section aria-labelledby={`${id}-title`} className="grid gap-3 rounded-lg border p-4">
      <h2 id={`${id}-title`} className="text-lg font-semibold">
        {t("title")}
      </h2>
      {coupon && (
        <div role="status" className="flex flex-wrap items-center gap-2 text-sm">
          <p>{t("applied", { code: coupon })}</p>
          <Button type="button" variant="ghost" size="sm" onClick={onRemoved}>
            {t("remove")}
          </Button>
        </div>
      )}
      <form onSubmit={onSubmit} noValidate className="grid gap-2">
        <Label htmlFor={`${id}-code`}>{t("label")}</Label>
        <div className="flex flex-wrap gap-2">
          <Input
            id={`${id}-code`}
            value={code}
            maxLength={40}
            autoCapitalize="characters"
            className="w-48 uppercase"
            aria-invalid={shownError ? true : undefined}
            aria-describedby={errorId}
            onChange={(event) => {
              setCode(event.target.value);
              apply.reset();
            }}
          />
          <Button type="submit" variant="outline" disabled={!base || apply.isPending || code.trim() === ""}>
            {apply.isPending ? t("applying") : t("apply")}
          </Button>
        </div>
        {!base && <p className="text-sm text-muted-foreground">{t("needsDelivery")}</p>}
        {shownError ? (
          <p id={errorId} className="text-sm text-destructive">
            {errorMessage(shownError)}
          </p>
        ) : null}
      </form>
    </section>
  );
}
