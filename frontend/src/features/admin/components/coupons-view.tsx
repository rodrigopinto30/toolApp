"use client";

import { useFormatter, useLocale, useTranslations } from "next-intl";

import { FormAlert } from "@/components/form/form-alert";
import { Button } from "@/components/ui/button";
import { CouponForm } from "@/features/admin/components/coupon-form";
import { DataTable, useAdminPage, type Column } from "@/features/admin/components/data-table";
import { ActiveBadge, ResourceHeader, RowActions } from "@/features/admin/components/resource-parts";
import { ResourceSheet, useResourceSheet } from "@/features/admin/components/resource-sheet";
import { useCoupons, useDeleteCoupon } from "@/features/admin/hooks";
import type { AdminCoupon } from "@/features/admin/types";
import { useErrorMessage } from "@/features/errors/use-error-message";
import type { Locale } from "@/i18n/locales";
import { formatDecimal, formatMoney } from "@/lib/money";

const PERCENT_DIGITS = 2;

export function CouponsView() {
  const t = useTranslations("Admin.coupons");
  const locale = useLocale() as Locale;
  const format = useFormatter();
  const errorMessage = useErrorMessage();
  const page = useAdminPage();
  const coupons = useCoupons(page);
  const remove = useDeleteCoupon();
  const sheet = useResourceSheet<AdminCoupon>();
  const dateOf = (value: string) => format.dateTime(new Date(value), { dateStyle: "short", timeStyle: "short" });

  const columns: Column<AdminCoupon>[] = [
    { header: t("code"), cell: (coupon) => <span className="font-medium">{coupon.code}</span> },
    {
      header: t("discount"),
      cell: (coupon) =>
        coupon.type === "percent"
          ? t("percentValue", { value: formatDecimal(coupon.value, locale, PERCENT_DIGITS) })
          : formatMoney({ amount: coupon.value, currency: "USD" }, locale),
    },
    { header: t("startsAt"), cell: (coupon) => dateOf(coupon.starts_at) },
    { header: t("endsAt"), cell: (coupon) => (coupon.ends_at ? dateOf(coupon.ends_at) : t("noEnd")) },
    {
      header: t("uses"),
      cell: (coupon) =>
        coupon.max_uses === null
          ? coupon.used_count
          : t("usesOf", { used: coupon.used_count, max: coupon.max_uses }),
    },
    { header: t("status"), cell: (coupon) => <ActiveBadge active={coupon.is_active} /> },
    {
      header: t("actions"),
      className: "text-right",
      cell: (coupon) => (
        <RowActions
          name={coupon.code}
          onEdit={() => sheet.edit(coupon)}
          deleteDescription={t("deleteDescription")}
          deleting={remove.isPending}
          onDelete={(done) => remove.mutate(coupon.id, { onSettled: done })}
        />
      ),
    },
  ];

  return (
    <div className="grid gap-4">
      <ResourceHeader title={t("title")}>
        <Button onClick={sheet.add}>{t("add")}</Button>
      </ResourceHeader>
      <FormAlert message={remove.error ? errorMessage(remove.error) : undefined} />
      <DataTable
        label={t("title")}
        columns={columns}
        rowKey={(coupon) => coupon.id}
        query={coupons}
        emptyLabel={t("empty")}
      />
      <ResourceSheet open={sheet.open} title={sheet.item ? t("editTitle") : t("addTitle")} onClose={sheet.close}>
        <CouponForm key={sheet.item?.id ?? "new"} coupon={sheet.item} onSaved={sheet.close} onCancel={sheet.close} />
      </ResourceSheet>
    </div>
  );
}
