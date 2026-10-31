"use client";
"use no memo";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { Controller, useForm, useFormState } from "react-hook-form";

import { CheckboxField } from "@/components/form/checkbox-field";
import { FormAlert } from "@/components/form/form-alert";
import { TextField } from "@/components/form/text-field";
import { Button } from "@/components/ui/button";
import { PictureField } from "@/features/admin/catalog/components/picture-field";
import { useAdminBrands, useBrandLogo, useDeleteBrand, useSaveBrand } from "@/features/admin/catalog/hooks";
import { brandSchema, type BrandValues } from "@/features/admin/catalog/schemas";
import type { AdminBrand } from "@/features/admin/catalog/types";
import { DataTable, type Column } from "@/features/admin/components/data-table";
import { ActiveBadge, FormActions, ResourceHeader, RowActions } from "@/features/admin/components/resource-parts";
import { ResourceSheet, useResourceSheet } from "@/features/admin/components/resource-sheet";
import { fieldsOf, isTaken } from "@/features/admin/form-errors";
import { useErrorMessage } from "@/features/errors/use-error-message";

const FIELDS = ["slug", "name"] as const;

function BrandForm({
  brand,
  onSaved,
  onCancel,
}: {
  brand?: AdminBrand;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("Admin.brands");
  const ta = useTranslations("Admin");
  const tv = useTranslations("Validation");
  const id = useId();
  const errorMessage = useErrorMessage();
  const save = useSaveBrand(brand?.id);
  const form = useForm<BrandValues>({
    resolver: zodResolver(brandSchema((key) => tv(key))),
    defaultValues: { slug: brand?.slug ?? "", name: brand?.name ?? "", is_active: brand?.is_active ?? true },
  });
  const { errors } = useFormState({ control: form.control });

  const onSubmit = form.handleSubmit((values) =>
    save.mutate(values, {
      onSuccess: () => onSaved(),
      onError: (error) =>
        fieldsOf(error, FIELDS).forEach((name) =>
          form.setError(name, { message: isTaken(error) ? errorMessage(error) : tv("invalid") }),
        ),
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormAlert message={save.error && !isTaken(save.error) ? errorMessage(save.error) : undefined} />
      <TextField
        id={`${id}-name`}
        label={t("name")}
        maxLength={120}
        error={errors.name?.message}
        registration={form.register("name")}
      />
      <TextField
        id={`${id}-slug`}
        label={t("slug")}
        hint={ta("slugHint")}
        maxLength={120}
        autoComplete="off"
        error={errors.slug?.message}
        registration={form.register("slug")}
      />
      <Controller
        control={form.control}
        name="is_active"
        render={({ field }) => (
          <CheckboxField id={`${id}-is_active`} label={ta("isActive")} checked={field.value} onChange={field.onChange} />
        )}
      />
      <FormActions pending={save.isPending} onCancel={onCancel} />
    </form>
  );
}

function BrandLogo({ brand }: { brand: AdminBrand }) {
  const t = useTranslations("Admin.brands");
  const { upload, remove } = useBrandLogo(brand.id);

  return <PictureField label={t("logo")} url={brand.logo_url} alt={brand.name} upload={upload} remove={remove} />;
}

export function BrandsView() {
  const t = useTranslations("Admin.brands");
  const errorMessage = useErrorMessage();
  const brands = useAdminBrands();
  const remove = useDeleteBrand();
  const sheet = useResourceSheet<AdminBrand>();
  const current = brands.data?.items.find((brand) => brand.id === sheet.item?.id) ?? sheet.item;

  const columns: Column<AdminBrand>[] = [
    { header: t("name"), cell: (brand) => <span className="font-medium">{brand.name}</span> },
    { header: t("slug"), cell: (brand) => brand.slug },
    { header: t("logo"), cell: (brand) => (brand.logo_url ? t("hasLogo") : t("noLogo")) },
    { header: t("status"), cell: (brand) => <ActiveBadge active={brand.is_active} /> },
    {
      header: t("actions"),
      className: "text-right",
      cell: (brand) => (
        <RowActions
          name={brand.name}
          onEdit={() => sheet.edit(brand)}
          deleteDescription={t("deleteDescription")}
          deleting={remove.isPending}
          onDelete={(done) => remove.mutate(brand.id, { onSettled: done })}
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
        rowKey={(brand) => brand.id}
        query={brands}
        emptyLabel={t("empty")}
      />
      <ResourceSheet open={sheet.open} title={current ? t("editTitle") : t("addTitle")} onClose={sheet.close}>
        <div className="grid gap-4">
          <BrandForm key={current?.id ?? "new"} brand={current} onSaved={sheet.close} onCancel={sheet.close} />
          {current && <BrandLogo brand={current} />}
        </div>
      </ResourceSheet>
    </div>
  );
}
