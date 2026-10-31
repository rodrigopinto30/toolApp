"use client";

import { useLocale, useTranslations } from "next-intl";

import { FormAlert } from "@/components/form/form-alert";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, type Column } from "@/features/admin/components/data-table";
import { ActiveBadge, ResourceHeader, RowActions } from "@/features/admin/components/resource-parts";
import { ResourceSheet, useResourceSheet } from "@/features/admin/components/resource-sheet";
import { ZoneForm } from "@/features/admin/components/zone-form";
import { useDeleteZone, useMoveProvince, useProvinces, useZones } from "@/features/admin/hooks";
import type { AdminProvince, AdminZone } from "@/features/admin/types";
import { useErrorMessage } from "@/features/errors/use-error-message";
import type { Locale } from "@/i18n/locales";
import { formatMoney } from "@/lib/money";

export function ShippingView() {
  const t = useTranslations("Admin.zones");
  const locale = useLocale() as Locale;
  const errorMessage = useErrorMessage();
  const zones = useZones();
  const provinces = useProvinces();
  const remove = useDeleteZone();
  const move = useMoveProvince();
  const sheet = useResourceSheet<AdminZone>();
  const failure = remove.error ?? move.error;
  const usd = (amount: string) => formatMoney({ amount, currency: "USD" }, locale);

  const zoneColumns: Column<AdminZone>[] = [
    { header: t("code"), cell: (zone) => <span className="font-medium">{zone.code}</span> },
    { header: t("name"), cell: (zone) => zone.name[locale] },
    { header: t("cost"), cell: (zone) => usd(zone.cost_usd) },
    { header: t("freeOver"), cell: (zone) => (zone.free_over_usd ? usd(zone.free_over_usd) : t("never")) },
    {
      header: t("eta"),
      cell: (zone) => t("etaDays", { min: zone.eta_min_days, max: zone.eta_max_days }),
    },
    { header: t("status"), cell: (zone) => <ActiveBadge active={zone.is_active} /> },
    {
      header: t("actions"),
      className: "text-right",
      cell: (zone) => (
        <RowActions
          name={zone.code}
          onEdit={() => sheet.edit(zone)}
          deleteDescription={t("deleteDescription")}
          deleting={remove.isPending}
          onDelete={(done) => remove.mutate(zone.id, { onSettled: done })}
        />
      ),
    },
  ];

  const provinceColumns: Column<AdminProvince>[] = [
    { header: t("province"), className: "whitespace-normal", cell: (province) => province.name },
    {
      header: t("zone"),
      className: "w-40 min-w-40",
      cell: (province) => (
        <Select
          value={String(province.shipping_zone_id)}
          disabled={move.isPending}
          onValueChange={(zoneId) => move.mutate({ code: province.code, zoneId: Number(zoneId) })}
        >
          <SelectTrigger aria-label={t("zoneOf", { name: province.name })} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            {zones.data?.items.map((zone) => (
              <SelectItem key={zone.id} value={String(zone.id)}>
                {zone.name[locale]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
  ];

  return (
    <div className="grid gap-8">
      <section className="grid gap-4">
        <ResourceHeader title={t("title")}>
          <Button onClick={sheet.add}>{t("add")}</Button>
        </ResourceHeader>
        <FormAlert message={failure ? errorMessage(failure) : undefined} />
        <DataTable
          label={t("title")}
          columns={zoneColumns}
          rowKey={(zone) => zone.id}
          query={zones}
          emptyLabel={t("empty")}
        />
      </section>
      <section aria-labelledby="admin-provinces" className="grid gap-4">
        <h2 id="admin-provinces" className="text-lg font-semibold">
          {t("provinces")}
        </h2>
        <DataTable
          label={t("provinces")}
          columns={provinceColumns}
          rowKey={(province) => province.code}
          query={provinces}
          emptyLabel={t("noProvinces")}
        />
      </section>
      <ResourceSheet open={sheet.open} title={sheet.item ? t("editTitle") : t("addTitle")} onClose={sheet.close}>
        <ZoneForm key={sheet.item?.id ?? "new"} zone={sheet.item} onSaved={sheet.close} onCancel={sheet.close} />
      </ResourceSheet>
    </div>
  );
}
