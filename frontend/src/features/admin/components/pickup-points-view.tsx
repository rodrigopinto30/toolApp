"use client";

import { useTranslations } from "next-intl";

import { FormAlert } from "@/components/form/form-alert";
import { Button } from "@/components/ui/button";
import { DataTable, useAdminPage, type Column } from "@/features/admin/components/data-table";
import { PickupPointForm } from "@/features/admin/components/pickup-point-form";
import { ActiveBadge, ResourceHeader, RowActions } from "@/features/admin/components/resource-parts";
import { ResourceSheet, useResourceSheet } from "@/features/admin/components/resource-sheet";
import { useDeletePickupPoint, usePickupPoints } from "@/features/admin/hooks";
import type { AdminPickupPoint } from "@/features/admin/types";
import { useErrorMessage } from "@/features/errors/use-error-message";

export function PickupPointsView() {
  const t = useTranslations("Admin.pickupPoints");
  const errorMessage = useErrorMessage();
  const page = useAdminPage();
  const points = usePickupPoints(page);
  const remove = useDeletePickupPoint();
  const sheet = useResourceSheet<AdminPickupPoint>();

  const columns: Column<AdminPickupPoint>[] = [
    { header: t("name"), cell: (point) => <span className="font-medium">{point.name}</span> },
    { header: t("address"), className: "whitespace-normal min-w-48", cell: (point) => point.address },
    { header: t("status"), cell: (point) => <ActiveBadge active={point.is_active} /> },
    {
      header: t("actions"),
      className: "text-right",
      cell: (point) => (
        <RowActions
          name={point.name}
          onEdit={() => sheet.edit(point)}
          deleteDescription={t("deleteDescription")}
          deleting={remove.isPending}
          onDelete={(done) => remove.mutate(point.id, { onSettled: done })}
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
        rowKey={(point) => point.id}
        query={points}
        emptyLabel={t("empty")}
      />
      <ResourceSheet open={sheet.open} title={sheet.item ? t("editTitle") : t("addTitle")} onClose={sheet.close}>
        <PickupPointForm
          key={sheet.item?.id ?? "new"}
          point={sheet.item}
          onSaved={sheet.close}
          onCancel={sheet.close}
        />
      </ResourceSheet>
    </div>
  );
}
