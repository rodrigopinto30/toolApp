"use client";
"use no memo";

import { useLocale, useTranslations } from "next-intl";
import { useId, useState } from "react";

import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { createAttemptKeys, keepsAttempt } from "@/features/checkout/attempt-keys";
import { CardFields, cardPayment, clearCard } from "@/features/checkout/components/card-fields";
import { useCardForm } from "@/features/checkout/use-card-form";
import { useErrorMessage } from "@/features/errors/use-error-message";
import { usePayOrder } from "@/features/orders/hooks";
import type { Order } from "@/features/orders/types";
import type { Locale } from "@/i18n/locales";
import { ApiError } from "@/lib/api/errors";
import { formatMoney } from "@/lib/money";
import { useCooldown } from "@/lib/use-cooldown";

export function PayOrderForm({
  order,
  onPaid,
  onRejected,
}: {
  order: Order;
  onPaid: () => void;
  onRejected: () => void;
}) {
  const t = useTranslations("Orders.pay");
  const id = useId();
  const locale = useLocale() as Locale;
  const errorMessage = useErrorMessage();
  const cooldown = useCooldown();
  const [keys] = useState(() => createAttemptKeys());
  const [stillPending, setStillPending] = useState(false);
  const form = useCardForm();
  const pay = usePayOrder(order.number, () => cardPayment(form.getValues()), { onPaid, onRejected });

  const onSubmit = form.handleSubmit(() => {
    setStillPending(false);
    pay.mutate(keys.keyFor(order.number), {
      onSuccess: ({ pending }) => {
        keys.settle();
        setStillPending(pending);
      },
      onError: (error) => {
        if (!keepsAttempt(error)) {
          keys.settle();
        }
        if (error instanceof ApiError && error.retryAfter) {
          cooldown.start(error.retryAfter);
        }
      },
      onSettled: () => clearCard(form),
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate aria-labelledby={`${id}-title`} className="grid gap-4 rounded-lg border p-4">
      <h2 id={`${id}-title`} className="text-lg font-semibold">
        {t("title")}
      </h2>
      <FormAlert message={stillPending ? t("pending") : pay.error ? errorMessage(pay.error) : undefined} />
      <CardFields form={form} idPrefix={id} />
      <SubmitButton
        pending={pay.isPending}
        pendingLabel={t("submitting")}
        disabled={cooldown.active}
        className="justify-self-start"
      >
        {t("submit", { total: formatMoney(order.total, locale) })}
      </SubmitButton>
    </form>
  );
}
