"use client";

import { useFormatter, useTranslations } from "next-intl";
import { parseAsInteger, useQueryState } from "nuqs";
import { useEffect, useState } from "react";

import { FormAlert } from "@/components/form/form-alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CART_PATH } from "@/features/cart/paths";
import { useErrorMessage } from "@/features/errors/use-error-message";
import { CancelOrder } from "@/features/orders/components/cancel-order";
import {
  OrderBillingDetails,
  OrderDelivery,
  OrderHistory,
  OrderItems,
  OrderPayments,
} from "@/features/orders/components/order-details";
import { OrderStatusBadge } from "@/features/orders/components/order-status-badge";
import { PayOrderForm } from "@/features/orders/components/pay-order-form";
import { useOrder } from "@/features/orders/hooks";
import { ORDERS_PATH } from "@/features/orders/paths";
import type { Order } from "@/features/orders/types";
import { useProtectedMe } from "@/features/session/use-protected-me";
import { Link } from "@/i18n/navigation";
import { ApiError } from "@/lib/api/errors";

type Notice = "placed" | "paid" | "rejected" | null;

const CANCELLABLE = new Set<Order["status"]>(["pending_payment", "paid"]);

function usePlacedNotice() {
  const [placed, setPlaced] = useQueryState("placed", parseAsInteger.withOptions({ history: "replace", scroll: false }));
  const [notice, setNotice] = useState<Notice>(placed === null ? null : "placed");

  useEffect(() => {
    if (placed !== null) {
      void setPlaced(null);
    }
  }, [placed, setPlaced]);

  return [notice, setNotice] as const;
}

export function OrderView({ number }: { number: string }) {
  const t = useTranslations("Orders");
  const errorMessage = useErrorMessage();
  useProtectedMe();
  const order = useOrder(number);
  const [notice, setNotice] = usePlacedNotice();

  if (order.error instanceof ApiError && order.error.status === 404) {
    return (
      <div className="grid justify-items-start gap-3">
        <p>{t("detail.notFound")}</p>
        <BackToOrders />
      </div>
    );
  }
  if (order.error) {
    return <FormAlert message={errorMessage(order.error)} />;
  }
  if (!order.data) {
    return (
      <div aria-busy="true" aria-label={t("detail.loading")} className="grid gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  return (
    <OrderContent
      order={order.data}
      notice={notice}
      onPaid={() => setNotice("paid")}
      onRejected={() => setNotice("rejected")}
    />
  );
}

function BackToOrders() {
  const t = useTranslations("Orders.detail");
  return (
    <Button asChild variant="ghost" size="sm" className="justify-self-start">
      <Link href={ORDERS_PATH}>{t("back")}</Link>
    </Button>
  );
}

function NoticeAlert({ order, notice }: { order: Order; notice: Notice }) {
  const t = useTranslations("Orders");

  if (notice === "rejected") {
    return (
      <div role="alert" className="grid justify-items-start gap-2 text-sm text-destructive">
        <p>{t("pay.rejected")}</p>
        <Link href={CART_PATH} className="underline underline-offset-4">
          {t("pay.cart")}
        </Link>
      </div>
    );
  }
  if (notice === "paid") {
    return <FormAlert tone="success" message={t("pay.paid")} />;
  }
  if (notice === "placed" && (order.status === "paid" || order.status === "pending_payment")) {
    return <FormAlert tone="success" message={t(`placed.${order.status}`)} />;
  }
  return null;
}

function OrderContent({
  order,
  notice,
  onPaid,
  onRejected,
}: {
  order: Order;
  notice: Notice;
  onPaid: () => void;
  onRejected: () => void;
}) {
  const t = useTranslations("Orders.detail");
  const format = useFormatter();

  return (
    <div className="grid gap-4">
      <BackToOrders />
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title", { number: order.number })}</h1>
          <p className="text-sm text-muted-foreground">
            {t("date", { date: format.dateTime(new Date(order.created_at), { dateStyle: "long" }) })}
          </p>
        </div>
        <OrderStatusBadge status={order.status} />
      </header>
      <NoticeAlert order={order} notice={notice} />
      {order.status === "pending_payment" && <PayOrderForm order={order} onPaid={onPaid} onRejected={onRejected} />}
      <OrderItems order={order} />
      <div className="grid gap-4 sm:grid-cols-2">
        <OrderDelivery order={order} />
        <OrderBillingDetails order={order} />
      </div>
      <OrderHistory order={order} />
      <OrderPayments order={order} />
      {CANCELLABLE.has(order.status) && <CancelOrder order={order} />}
    </div>
  );
}
