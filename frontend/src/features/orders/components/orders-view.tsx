"use client";

import { useFormatter, useLocale, useTranslations } from "next-intl";
import { parseAsInteger, useQueryState } from "nuqs";

import { FormAlert } from "@/components/form/form-alert";
import { Pagination } from "@/components/layout/pagination";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useErrorMessage } from "@/features/errors/use-error-message";
import { OrderStatusBadge } from "@/features/orders/components/order-status-badge";
import { useOrders } from "@/features/orders/hooks";
import { ORDERS_PATH, orderPath } from "@/features/orders/paths";
import type { OrderSummary } from "@/features/orders/types";
import { useProtectedMe } from "@/features/session/use-protected-me";
import type { Locale } from "@/i18n/locales";
import { Link } from "@/i18n/navigation";
import { formatMoney } from "@/lib/money";

const MAX_PAGE = 1000;

export function OrdersView() {
  const t = useTranslations("Orders");
  const errorMessage = useErrorMessage();
  useProtectedMe();
  const [requested] = useQueryState("page", parseAsInteger.withDefault(1));
  const page = Math.min(Math.max(requested, 1), MAX_PAGE);
  const orders = useOrders(page);

  if (orders.error) {
    return <FormAlert message={errorMessage(orders.error)} />;
  }
  if (!orders.data) {
    return (
      <div aria-busy="true" aria-label={t("loading")} className="grid gap-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }
  if (orders.data.total === 0) {
    return (
      <div className="grid justify-items-center gap-3 rounded-lg border border-dashed px-4 py-12 text-center">
        <p className="text-lg font-semibold">{t("empty.title")}</p>
        <Button asChild variant="outline">
          <Link href="/">{t("empty.cta")}</Link>
        </Button>
      </div>
    );
  }
  return (
    <div className="grid gap-4">
      <ul className="grid gap-2">
        {orders.data.items.map((order) => (
          <OrderRow key={order.number} order={order} />
        ))}
      </ul>
      <Pagination
        page={orders.data.page}
        pages={orders.data.pages}
        href={(target) => (target === 1 ? ORDERS_PATH : `${ORDERS_PATH}?page=${target}`)}
      />
    </div>
  );
}

function OrderRow({ order }: { order: OrderSummary }) {
  const t = useTranslations("Orders");
  const locale = useLocale() as Locale;
  const format = useFormatter();
  const date = format.dateTime(new Date(order.created_at), { dateStyle: "medium" });

  return (
    <li>
      <Link
        href={orderPath(order.number)}
        className="grid gap-1 rounded-lg border p-3 transition-colors hover:bg-muted/50 sm:grid-cols-[1fr_auto] sm:items-center"
      >
        <span className="grid gap-0.5">
          <span className="font-medium">{t("row", { number: order.number, date })}</span>
          <span className="text-sm text-muted-foreground">{t("units", { count: order.item_count })}</span>
        </span>
        <span className="flex items-center gap-3 sm:justify-end">
          <OrderStatusBadge status={order.status} />
          <span className="font-medium tabular-nums">{formatMoney(order.total, locale)}</span>
        </span>
      </Link>
    </li>
  );
}
