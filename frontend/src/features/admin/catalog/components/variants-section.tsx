"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { ConfirmAction } from "@/components/form/confirm-action";
import { FormAlert } from "@/components/form/form-alert";
import { Button } from "@/components/ui/button";
import { StockForm, VariantForm } from "@/features/admin/catalog/components/variant-forms";
import { useAdminAttributes, useArchiveVariant } from "@/features/admin/catalog/hooks";
import type { AdminProduct, AdminVariant } from "@/features/admin/catalog/types";
import { DataTable, type Column } from "@/features/admin/components/data-table";
import { ActiveBadge } from "@/features/admin/components/resource-parts";
import { ResourceSheet, useResourceSheet } from "@/features/admin/components/resource-sheet";
import { useErrorMessage } from "@/features/errors/use-error-message";
import type { Locale } from "@/i18n/locales";
import { formatMoney } from "@/lib/money";

export function VariantsSection({ product }: { product: AdminProduct }) {
  const t = useTranslations("Admin.variants");
  const ta = useTranslations("Admin");
  const locale = useLocale() as Locale;
  const errorMessage = useErrorMessage();
  const attributes = useAdminAttributes();
  const archive = useArchiveVariant();
  const sheet = useResourceSheet<AdminVariant>();
  const [stockId, setStockId] = useState<number | null>(null);
  const stockVariant = product.variants.find((variant) => variant.id === stockId);
  const values = (attributes.data?.items ?? []).flatMap((attribute) => attribute.values);
  const usd = (amount: string) => formatMoney({ amount, currency: "USD" }, locale);
  const optionsOf = (variant: AdminVariant) =>
    values
      .filter((value) => variant.attribute_value_ids.includes(value.id))
      .map((value) => value.value[locale])
      .join(", ");

  const columns: Column<AdminVariant>[] = [
    { header: t("sku"), cell: (variant) => <span className="font-medium">{variant.sku}</span> },
    { header: t("options"), cell: (variant) => optionsOf(variant) || t("noOption") },
    { header: t("price"), cell: (variant) => usd(variant.price_usd) },
    {
      header: t("compareAt"),
      cell: (variant) => (variant.compare_at_price_usd ? usd(variant.compare_at_price_usd) : t("noOption")),
    },
    { header: t("stock"), cell: (variant) => variant.stock },
    { header: t("status"), cell: (variant) => <ActiveBadge active={variant.is_active} /> },
    {
      header: t("actions"),
      className: "text-right",
      cell: (variant) => (
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            aria-label={t("stockItem", { sku: variant.sku })}
            onClick={() => setStockId(variant.id)}
          >
            {t("stock")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            aria-label={ta("editItem", { name: variant.sku })}
            onClick={() => sheet.edit(variant)}
          >
            {ta("edit")}
          </Button>
          {variant.is_active && (
            <ConfirmAction
              label={t("archive")}
              accessibleLabel={t("archiveItem", { sku: variant.sku })}
              title={t("archiveTitle", { sku: variant.sku })}
              description={t("archiveDescription")}
              confirmLabel={t("confirmArchive")}
              pendingLabel={t("archiving")}
              cancelLabel={ta("keep")}
              pending={archive.isPending}
              size="sm"
              onConfirm={(done) => archive.mutate(variant.id, { onSettled: done })}
            />
          )}
        </div>
      ),
    },
  ];

  return (
    <section aria-labelledby="admin-variants" className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 id="admin-variants" className="text-lg font-semibold">
          {t("title")}
        </h2>
        <Button variant="outline" onClick={sheet.add}>
          {t("add")}
        </Button>
      </div>
      <FormAlert message={archive.error ? errorMessage(archive.error) : undefined} />
      <DataTable
        label={t("title")}
        columns={columns}
        rowKey={(variant) => variant.id}
        query={{
          data: {
            items: product.variants,
            page: 1,
            size: product.variants.length,
            total: product.variants.length,
            pages: 1,
          },
          error: null,
        }}
        emptyLabel={t("empty")}
      />
      <ResourceSheet open={sheet.open} title={sheet.item ? t("editTitle") : t("addTitle")} onClose={sheet.close}>
        {attributes.data ? (
          <VariantForm
            key={sheet.item?.id ?? "new"}
            productId={product.id}
            variant={sheet.item}
            attributes={attributes.data.items}
            onSaved={sheet.close}
            onCancel={sheet.close}
          />
        ) : (
          <p className="text-muted-foreground">{ta("loadingList")}</p>
        )}
      </ResourceSheet>
      <ResourceSheet
        open={stockVariant !== undefined}
        title={t("stockTitle", { sku: stockVariant?.sku ?? "" })}
        onClose={() => setStockId(null)}
      >
        {stockVariant && (
          <StockForm
            key={stockVariant.id}
            variant={stockVariant}
            onSaved={() => setStockId(null)}
            onCancel={() => setStockId(null)}
          />
        )}
      </ResourceSheet>
    </section>
  );
}
