"use client";

import { useFormatter, useLocale, useTranslations } from "next-intl";
import { parseAsInteger, parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";

import { SelectField } from "@/components/form/select-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NO_VALUE } from "@/features/admin/catalog/schemas";
import { DataTable, useAdminPage, type Column } from "@/features/admin/components/data-table";
import { ResourceHeader } from "@/features/admin/components/resource-parts";
import { endOfDay, startOfDay } from "@/features/admin/dates";
import { parseAsDay } from "@/features/admin/filters";
import { useAdminOrders } from "@/features/admin/operations/hooks";
import { adminOrderPath } from "@/features/admin/paths";
import type { AdminOrderSummary } from "@/features/admin/operations/types";
import { OrderStatusBadge } from "@/features/orders/components/order-status-badge";
import type { OrderStatus } from "@/features/orders/types";
import type { Locale } from "@/i18n/locales";
import { Link } from "@/i18n/navigation";
import { formatMoney } from "@/lib/money";

const ORDER_STATUSES = [
  "pending_payment",
  "paid",
  "preparing",
  "shipped",
  "ready_for_pickup",
  "delivered",
  "cancelled",
  "refunded",
] as const satisfies readonly OrderStatus[];
const NUMBER_MAX_LENGTH = 20;
const EMAIL_MAX_LENGTH = 254;

const FILTERS = {
  status: parseAsStringLiteral(ORDER_STATUSES),
  number: parseAsString,
  email: parseAsString,
  from: parseAsDay,
  to: parseAsDay,
  page: parseAsInteger,
};

export function OrdersView() {
  const t = useTranslations("Admin.orders");
  const ts = useTranslations("Orders.status");
  const td = useTranslations("Orders.delivery");
  const locale = useLocale() as Locale;
  const format = useFormatter();
  const [filters, setFilters] = useQueryStates(FILTERS);
  const page = useAdminPage();
  const orders = useAdminOrders(page, {
    status: filters.status ?? undefined,
    number: filters.number ?? undefined,
    email: filters.email ?? undefined,
    date_from: filters.from ? startOfDay(filters.from) : undefined,
    date_to: filters.to ? endOfDay(filters.to) : undefined,
  });

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const { elements } = event.currentTarget;
    const value = (name: string) => (elements.namedItem(name) as HTMLInputElement).value.trim() || null;
    void setFilters({
      number: value("number"),
      email: value("email"),
      from: value("from"),
      to: value("to"),
      page: null,
    });
  };

  const columns: Column<AdminOrderSummary>[] = [
    {
      header: t("number"),
      cell: (order) => (
        <Link href={adminOrderPath(order.number)} className="font-medium underline-offset-4 hover:underline">
          {order.number}
        </Link>
      ),
    },
    {
      header: t("date"),
      cell: (order) => format.dateTime(new Date(order.created_at), { dateStyle: "short", timeStyle: "short" }),
    },
    {
      header: t("customer"),
      className: "min-w-40 whitespace-normal wrap-anywhere",
      cell: (order) => order.customer.email,
    },
    { header: t("delivery"), cell: (order) => td(order.delivery_method) },
    { header: t("units"), cell: (order) => order.item_count },
    { header: t("total"), cell: (order) => formatMoney(order.total, locale) },
    { header: t("status"), cell: (order) => <OrderStatusBadge status={order.status} /> },
  ];

  return (
    <div className="grid gap-4">
      <ResourceHeader title={t("title")} />
      <SelectField
        id="admin-orders-status"
        label={t("status")}
        options={[
          { value: NO_VALUE, label: t("allStatuses") },
          ...ORDER_STATUSES.map((value) => ({ value, label: ts(value) })),
        ]}
        value={filters.status ?? NO_VALUE}
        onChange={(value) =>
          void setFilters({ status: value === NO_VALUE ? null : (value as OrderStatus), page: null })
        }
      />
      <form
        key={JSON.stringify([filters.number, filters.email, filters.from, filters.to])}
        aria-label={t("filters")}
        onSubmit={onSubmit}
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <div className="grid gap-2">
          <Label htmlFor="admin-orders-number">{t("number")}</Label>
          <Input
            id="admin-orders-number"
            name="number"
            maxLength={NUMBER_MAX_LENGTH}
            defaultValue={filters.number ?? ""}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="admin-orders-email">{t("email")}</Label>
          <Input id="admin-orders-email" name="email" maxLength={EMAIL_MAX_LENGTH} defaultValue={filters.email ?? ""} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="admin-orders-from">{t("from")}</Label>
          <Input id="admin-orders-from" name="from" type="date" defaultValue={filters.from ?? ""} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="admin-orders-to">{t("to")}</Label>
          <Input id="admin-orders-to" name="to" type="date" defaultValue={filters.to ?? ""} />
        </div>
        <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4">
          <Button type="submit" variant="outline" size="sm">
            {t("apply")}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => void setFilters(null)}>
            {t("clear")}
          </Button>
        </div>
      </form>
      <DataTable
        label={t("title")}
        columns={columns}
        rowKey={(order) => order.number}
        query={orders}
        emptyLabel={t("empty")}
      />
    </div>
  );
}
