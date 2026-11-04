"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useId, useState } from "react";

import { ConfirmAction } from "@/components/form/confirm-action";
import { FormAlert } from "@/components/form/form-alert";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAdminOrder, useChangeOrderStatus } from "@/features/admin/operations/hooks";
import type { AdminOrder } from "@/features/admin/operations/types";
import { ADMIN_ORDERS_PATH } from "@/features/admin/paths";
import { useErrorMessage } from "@/features/errors/use-error-message";
import {
  isKnownNote,
  OrderBillingDetails,
  OrderDelivery,
  OrderItems,
  OrderPayments,
} from "@/features/orders/components/order-details";
import { OrderStatusBadge } from "@/features/orders/components/order-status-badge";
import { StatusTimeline } from "@/features/orders/components/status-timeline";
import { Link } from "@/i18n/navigation";
import { ApiError } from "@/lib/api/errors";

const NOTE_MAX_LENGTH = 500;
const ACTION_STATUSES = ["preparing", "shipped", "ready_for_pickup", "delivered", "refunded"] as const;

type ActionStatus = (typeof ACTION_STATUSES)[number];

function isActionStatus(status: AdminOrder["status"]): status is ActionStatus {
  return ACTION_STATUSES.some((known) => known === status);
}

function BackLink() {
  const t = useTranslations("Admin.orders");

  return (
    <Link href={ADMIN_ORDERS_PATH} className="text-sm underline-offset-4 hover:underline">
      {t("back")}
    </Link>
  );
}

function OrderActions({ order }: { order: AdminOrder }) {
  const t = useTranslations("Admin.orders");
  const ts = useTranslations("Orders.status");
  const ta = useTranslations("Admin");
  const id = useId();
  const errorMessage = useErrorMessage();
  const change = useChangeOrderStatus(order.number);
  const [note, setNote] = useState("");

  const actions = order.next_statuses.filter(isActionStatus);

  const send = (status: ActionStatus, done?: () => void) =>
    change.mutate(
      { status, note: note.trim() || null },
      {
        onSuccess: () => setNote(""),
        onSettled: done,
      },
    );

  return (
    <section aria-labelledby={`${id}-title`} className="grid gap-3 rounded-xl border bg-card p-4 shadow-xs">
      <h2 id={`${id}-title`} className="text-base font-semibold">
        {t("actionsTitle")}
      </h2>
      <FormAlert message={change.error ? errorMessage(change.error) : undefined} />
      <FormAlert tone="success" message={change.isSuccess ? t("changed", { status: ts(order.status) }) : undefined} />
      {actions.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("finished")}</p>
      ) : (
        <>
          <div className="grid gap-2">
            <Label htmlFor={`${id}-note`}>{t("note")}</Label>
            <Textarea
              id={`${id}-note`}
              rows={2}
              maxLength={NOTE_MAX_LENGTH}
              aria-describedby={`${id}-note-hint`}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
            <p id={`${id}-note-hint`} className="text-xs text-muted-foreground">
              {t("noteHint")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {actions.map((status) =>
              status === "refunded" ? (
                <ConfirmAction
                  key={status}
                  label={t("actions.refunded")}
                  title={t("refundTitle", { number: order.number })}
                  description={t("refundDescription")}
                  confirmLabel={t("confirmRefund")}
                  pendingLabel={t("refunding")}
                  cancelLabel={ta("keep")}
                  pending={change.isPending}
                  onConfirm={(done) => send(status, done)}
                />
              ) : (
                <Button key={status} disabled={change.isPending} onClick={() => send(status)}>
                  {t(`actions.${status}`)}
                </Button>
              ),
            )}
          </div>
        </>
      )}
    </section>
  );
}

function History({ order }: { order: AdminOrder }) {
  const t = useTranslations("Admin.orders");
  const to = useTranslations("Orders");
  const format = useFormatter();
  const id = useId();

  return (
    <section aria-labelledby={id} className="grid gap-3 rounded-xl border bg-card p-4 shadow-xs">
      <h2 id={id} className="text-base font-semibold">
        {to("history.title")}
      </h2>
      <StatusTimeline items={order.status_history} itemKey={(change) => `${change.to_status}-${change.created_at}`}>
        {(change) => (
          <>
            <span className="font-medium">{to(`status.${change.to_status}`)}</span>
            <span className="text-muted-foreground">
              {format.dateTime(new Date(change.created_at), { dateStyle: "medium", timeStyle: "short" })}
              {" · "}
              {change.changed_by === null ? t("bySystem") : t("byUser", { id: change.changed_by })}
            </span>
            {change.note && (
              <span className="wrap-anywhere whitespace-pre-line">
                {isKnownNote(change.note) ? to(`history.notes.${change.note}`) : change.note}
              </span>
            )}
          </>
        )}
      </StatusTimeline>
    </section>
  );
}

function Customer({ order }: { order: AdminOrder }) {
  const t = useTranslations("Admin.orders");
  const id = useId();

  return (
    <section aria-labelledby={id} className="grid gap-3 rounded-xl border bg-card p-4 shadow-xs">
      <h2 id={id} className="text-base font-semibold">
        {t("customer")}
      </h2>
      <div className="grid gap-1 text-sm">
        <p className="font-medium">
          {order.customer.first_name} {order.customer.last_name}
        </p>
        <p className="wrap-anywhere text-muted-foreground">{order.customer.email}</p>
        <p className="text-muted-foreground">{t(`languages.${order.locale}`)}</p>
      </div>
    </section>
  );
}

export function OrderView({ number }: { number: string }) {
  const t = useTranslations("Admin.orders");
  const to = useTranslations("Orders.detail");
  const errorMessage = useErrorMessage();
  const order = useAdminOrder(number);

  if (order.error instanceof ApiError && order.error.status === 404) {
    return (
      <div className="grid gap-4">
        <BackLink />
        <EmptyState description={to("notFound")} />
      </div>
    );
  }
  if (order.error) {
    return <FormAlert message={errorMessage(order.error)} />;
  }
  if (!order.data) {
    return (
      <div aria-busy="true" aria-label={to("loading")} className="grid gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  const { data } = order;

  return (
    <div className="grid gap-4">
      <BackLink />
      <header className="flex flex-wrap items-center justify-between gap-3">
        <PageHeading>{to("title", { number: data.number })}</PageHeading>
        <OrderStatusBadge status={data.status} />
      </header>
      <OrderActions order={data} />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Customer order={data} />
        <OrderDelivery order={data} />
      </div>
      <OrderItems order={data} />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <OrderBillingDetails order={data} />
        <OrderPayments order={data} />
      </div>
      <History order={data} />
      <p className="text-xs text-muted-foreground">{t("rateNote", { rate: data.exchange_rate })}</p>
    </div>
  );
}
