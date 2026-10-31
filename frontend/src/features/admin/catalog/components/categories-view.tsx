"use client";

import { useLocale, useTranslations } from "next-intl";

import { FormAlert } from "@/components/form/form-alert";
import { Button } from "@/components/ui/button";
import { CategoryForm } from "@/features/admin/catalog/components/category-form";
import { PictureField } from "@/features/admin/catalog/components/picture-field";
import { useAdminCategories, useCategoryImage, useDeleteCategory } from "@/features/admin/catalog/hooks";
import { flattenTree, type CategoryRow } from "@/features/admin/catalog/tree";
import type { AdminCategory } from "@/features/admin/catalog/types";
import { DataTable, type Column } from "@/features/admin/components/data-table";
import { ActiveBadge, ResourceHeader, RowActions } from "@/features/admin/components/resource-parts";
import { ResourceSheet, useResourceSheet } from "@/features/admin/components/resource-sheet";
import { useErrorMessage } from "@/features/errors/use-error-message";
import type { Locale } from "@/i18n/locales";

const DEPTH_PADDING = ["", "pl-4", "pl-8"];

function CategoryImage({ category }: { category: AdminCategory }) {
  const t = useTranslations("Admin.categories");
  const locale = useLocale() as Locale;
  const { upload, remove } = useCategoryImage(category.id);

  return (
    <PictureField
      label={t("image")}
      url={category.image_url}
      alt={category.name[locale]}
      upload={upload}
      remove={remove}
    />
  );
}

export function CategoriesView() {
  const t = useTranslations("Admin.categories");
  const locale = useLocale() as Locale;
  const errorMessage = useErrorMessage();
  const categories = useAdminCategories();
  const remove = useDeleteCategory();
  const sheet = useResourceSheet<AdminCategory>();
  const items = categories.data?.items ?? [];
  const current = items.find((category) => category.id === sheet.item?.id) ?? sheet.item;

  const columns: Column<CategoryRow>[] = [
    {
      header: t("name"),
      cell: ({ category, depth }) => <span className={DEPTH_PADDING[depth]}>{category.name[locale]}</span>,
    },
    { header: t("slug"), cell: ({ category }) => category.slug },
    { header: t("position"), cell: ({ category }) => category.position },
    { header: t("status"), cell: ({ category }) => <ActiveBadge active={category.is_active} /> },
    {
      header: t("actions"),
      className: "text-right",
      cell: ({ category }) => (
        <RowActions
          name={category.slug}
          onEdit={() => sheet.edit(category)}
          deleteDescription={t("deleteDescription")}
          deleting={remove.isPending}
          onDelete={(done) => remove.mutate(category.id, { onSettled: done })}
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
        rowKey={({ category }) => category.id}
        query={{ data: categories.data && { ...categories.data, items: flattenTree(items) }, error: categories.error }}
        emptyLabel={t("empty")}
      />
      <ResourceSheet open={sheet.open} title={current ? t("editTitle") : t("addTitle")} onClose={sheet.close}>
        <div className="grid gap-4">
          <CategoryForm
            key={current?.id ?? "new"}
            category={current}
            categories={items}
            onSaved={sheet.close}
            onCancel={sheet.close}
          />
          {current && <CategoryImage category={current} />}
        </div>
      </ResourceSheet>
    </div>
  );
}
