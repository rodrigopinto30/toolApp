"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { FormAlert } from "@/components/form/form-alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
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
  const [open, setOpen] = useState(false);

  return (
    <div className="grid gap-3">
      <FormAlert message={cancel.error ? errorMessage(cancel.error) : undefined} />
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger asChild>
          <Button variant="outline" className="justify-self-start">
            {t("open")}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("title", { number: order.number })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("description")}
              {order.status === "paid" && ` ${t("refund", { total: formatMoney(order.total, locale) })}`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancel.isPending}>{t("keep")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={cancel.isPending}
              onClick={(event) => {
                event.preventDefault();
                cancel.mutate(undefined, { onSettled: () => setOpen(false) });
              }}
            >
              {cancel.isPending ? t("confirming") : t("confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
