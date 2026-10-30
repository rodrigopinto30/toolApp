"use client";

import { useLocale, useTranslations } from "next-intl";

import { ConfirmAction } from "@/components/form/confirm-action";
import { FormAlert } from "@/components/form/form-alert";
import { useErrorMessage } from "@/features/errors/use-error-message";
import { useCancelOrder } from "@/features/orders/hooks";
import type { Order } from "@/features/orders/types";
import type { Locale } from "@/i18n/locales";
import { formatMoney } from "@/lib/money";

export function CancelOrder({ order }: { order: Order }) {
  const t = useTranslations("Orders.cancel");
  const locale = useLocale() as Locale;
  const errorMessage = useErrorMessage();
  const cancel = useCancelOrder(order.number);
  const refund = order.status === "paid" ? ` ${t("refund", { total: formatMoney(order.total, locale) })}` : "";

  return (
    <div className="grid gap-3">
      <FormAlert message={cancel.error ? errorMessage(cancel.error) : undefined} />
      <ConfirmAction
        label={t("open")}
        title={t("title", { number: order.number })}
        description={`${t("description")}${refund}`}
        confirmLabel={t("confirm")}
        pendingLabel={t("confirming")}
        cancelLabel={t("keep")}
        pending={cancel.isPending}
        className="justify-self-start"
        onConfirm={(close) => cancel.mutate(undefined, { onSettled: close })}
      />
    </div>
  );
}
