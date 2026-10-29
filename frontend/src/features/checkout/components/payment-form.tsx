"use client";
"use no memo";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";

import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { cartKeys } from "@/features/cart/hooks";
import { CART_PATH } from "@/features/cart/paths";
import { createAttemptKeys, keepsAttempt } from "@/features/checkout/attempt-keys";
import { CardFields, cardPayment, clearCard } from "@/features/checkout/components/card-fields";
import { checkoutKeys, usePlaceOrder } from "@/features/checkout/hooks";
import { failureOf, type Failure } from "@/features/checkout/outcome";
import { cardSchema, type CardValues } from "@/features/checkout/schemas";
import type { CheckoutPreviewRequest } from "@/features/checkout/types";
import { useErrorMessage } from "@/features/errors/use-error-message";
import { orderPath } from "@/features/orders/paths";
import { sessionKeys } from "@/features/session/hooks";
import type { Locale } from "@/i18n/locales";
import { Link, useRouter } from "@/i18n/navigation";
import { ApiError } from "@/lib/api/errors";
import { formatMoney, type Money } from "@/lib/money";
import { useCooldown } from "@/lib/use-cooldown";

export function PaymentForm({
  body,
  total,
  onCouponFailed,
  onPlaced,
}: {
  body: CheckoutPreviewRequest | null;
  total: Money | undefined;
  onCouponFailed: (error: unknown) => void;
  onPlaced: () => void;
}) {
  const t = useTranslations("Checkout");
  const tv = useTranslations("Validation");
  const id = useId();
  const locale = useLocale() as Locale;
  const router = useRouter();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const cooldown = useCooldown();
  const [keys] = useState(() => createAttemptKeys());
  const [failure, setFailure] = useState<{ failure: Failure; error: unknown } | null>(null);
  const form = useForm<CardValues>({
    resolver: zodResolver(cardSchema((key) => tv(key))),
    defaultValues: { card_number: "", expiry: "", cvc: "", holder: "" },
  });
  const place = usePlaceOrder(() => cardPayment(form.getValues()));

  const onFailure = (error: unknown) => {
    const result = failureOf(error);
    setFailure({ failure: result, error });
    if (result.kind === "rejected" || result.kind === "cart") {
      void queryClient.invalidateQueries({ queryKey: cartKeys.all });
    } else if (result.kind === "totalChanged") {
      queryClient.setQueryData(checkoutKeys.preview(body, locale), result.preview);
    } else if (result.kind === "coupon") {
      onCouponFailed(error);
    } else if (result.kind === "verify") {
      void queryClient.invalidateQueries({ queryKey: sessionKeys.me });
    }
    if (error instanceof ApiError && error.retryAfter) {
      cooldown.start(error.retryAfter);
    }
  };

  const onSubmit = form.handleSubmit(() => {
    if (!body || !total) {
      return;
    }
    const request = { ...body, expected_total: { amount: total.amount, currency: total.currency } };
    const key = keys.keyFor(JSON.stringify(request));
    setFailure(null);
    place.mutate(
      { body: request, key },
      {
        onSuccess: ({ order }) => {
          keys.settle();
          onPlaced();
          router.replace(`${orderPath(order.number)}?placed=1`);
          void queryClient.invalidateQueries({ queryKey: cartKeys.all });
        },
        onError: (error) => {
          if (!keepsAttempt(error)) {
            keys.settle();
          }
          onFailure(error);
        },
        onSettled: () => clearCard(form),
      },
    );
  });

  return (
    <form onSubmit={onSubmit} noValidate aria-labelledby={`${id}-title`} className="grid gap-4 rounded-lg border p-4">
      <h2 id={`${id}-title`} className="text-lg font-semibold">
        {t("payment.title")}
      </h2>
      <FailureAlert failure={failure} errorMessage={errorMessage} />
      <CardFields form={form} idPrefix={id} />
      <SubmitButton
        pending={place.isPending}
        pendingLabel={t("payment.submitting")}
        disabled={!body || !total || cooldown.active}
        className="justify-self-start"
      >
        {total ? t("payment.submit", { total: formatMoney(total, locale) }) : t("payment.submitNoTotal")}
      </SubmitButton>
    </form>
  );
}

function FailureAlert({
  failure,
  errorMessage,
}: {
  failure: { failure: Failure; error: unknown } | null;
  errorMessage: (error: unknown) => string;
}) {
  const t = useTranslations("Checkout");

  if (!failure) {
    return null;
  }
  switch (failure.failure.kind) {
    case "rejected":
      return <FormAlert message={t("outcome.rejected", { number: failure.failure.orderNumber })} />;
    case "totalChanged":
      return <FormAlert message={t("outcome.totalChanged")} />;
    case "cart":
      return (
        <div role="alert" className="grid gap-2 text-sm text-destructive">
          <p>{t("outcome.cart")}</p>
          <Link href={CART_PATH} className="underline underline-offset-4">
            {t("backToCart")}
          </Link>
        </div>
      );
    case "coupon":
    case "verify":
      return null;
    default:
      return <FormAlert message={errorMessage(failure.error)} />;
  }
}
