"use client";
"use no memo";

import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Controller, useForm, useFormState } from "react-hook-form";

import { CheckboxField } from "@/components/form/checkbox-field";
import { ConfirmAction } from "@/components/form/confirm-action";
import { FormAlert } from "@/components/form/form-alert";
import { TextField } from "@/components/form/text-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useAdminAttributes,
  useDeleteAttribute,
  useDeleteAttributeValue,
  useSaveAttribute,
  useSaveAttributeValue,
} from "@/features/admin/catalog/hooks";
import {
  attributeSchema,
  attributeValueSchema,
  type AttributeValueInput,
  type AttributeValues,
  type AttributeValueValues,
} from "@/features/admin/catalog/schemas";
import type { AdminAttribute, AdminAttributeValue } from "@/features/admin/catalog/types";
import { DataTable, type Column } from "@/features/admin/components/data-table";
import { FormActions, I18nFields, ResourceHeader, RowActions } from "@/features/admin/components/resource-parts";
import { ResourceSheet, useResourceSheet } from "@/features/admin/components/resource-sheet";
import { fieldsOf, isTaken } from "@/features/admin/form-errors";
import { useErrorMessage } from "@/features/errors/use-error-message";
import type { Locale } from "@/i18n/locales";

const ATTRIBUTE_FIELDS = ["code"] as const;
const VALUE_FIELDS = ["slug", "position"] as const;

function AttributeForm({
  attribute,
  onSaved,
  onCancel,
}: {
  attribute?: AdminAttribute;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("Admin.attributes");
  const tv = useTranslations("Validation");
  const id = useId();
  const errorMessage = useErrorMessage();
  const save = useSaveAttribute(attribute?.id);
  const form = useForm<AttributeValues>({
    resolver: zodResolver(attributeSchema((key) => tv(key))),
    defaultValues: {
      code: attribute?.code ?? "",
      name: attribute?.name ?? { es: "", en: "" },
      is_filterable: attribute?.is_filterable ?? true,
    },
  });
  const { errors } = useFormState({ control: form.control });

  const onSubmit = form.handleSubmit((values) =>
    save.mutate(values, {
      onSuccess: () => onSaved(),
      onError: (error) =>
        fieldsOf(error, ATTRIBUTE_FIELDS).forEach((name) =>
          form.setError(name, { message: isTaken(error) ? errorMessage(error) : tv("invalid") }),
        ),
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormAlert message={save.error && !isTaken(save.error) ? errorMessage(save.error) : undefined} />
      <TextField
        id={`${id}-code`}
        label={t("code")}
        hint={t("codeHint")}
        maxLength={40}
        autoComplete="off"
        error={errors.code?.message}
        registration={form.register("code")}
      />
      <I18nFields
        id={`${id}-name`}
        label={t("name")}
        maxLength={120}
        es={{ registration: form.register("name.es"), error: errors.name?.es?.message }}
        en={{ registration: form.register("name.en"), error: errors.name?.en?.message }}
      />
      <Controller
        control={form.control}
        name="is_filterable"
        render={({ field }) => (
          <CheckboxField
            id={`${id}-is_filterable`}
            label={t("isFilterable")}
            checked={field.value}
            onChange={field.onChange}
          />
        )}
      />
      <FormActions pending={save.isPending} onCancel={onCancel} />
    </form>
  );
}

function ValueForm({
  attributeId,
  value,
  onDone,
}: {
  attributeId: number;
  value?: AdminAttributeValue;
  onDone: () => void;
}) {
  const t = useTranslations("Admin.attributes");
  const ta = useTranslations("Admin");
  const tv = useTranslations("Validation");
  const id = useId();
  const errorMessage = useErrorMessage();
  const save = useSaveAttributeValue(attributeId, value?.id);
  const form = useForm<AttributeValueValues, unknown, AttributeValueInput>({
    resolver: zodResolver(attributeValueSchema((key) => tv(key))),
    defaultValues: {
      slug: value?.slug ?? "",
      value: value?.value ?? { es: "", en: "" },
      position: String(value?.position ?? 0),
    },
  });
  const { errors } = useFormState({ control: form.control });

  const onSubmit = form.handleSubmit((values) =>
    save.mutate(values, {
      onSuccess: () => onDone(),
      onError: (error) =>
        fieldsOf(error, VALUE_FIELDS).forEach((name) =>
          form.setError(name, { message: isTaken(error) ? errorMessage(error) : tv("invalid") }),
        ),
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormAlert message={save.error && !isTaken(save.error) ? errorMessage(save.error) : undefined} />
      <I18nFields
        id={`${id}-value`}
        label={t("value")}
        maxLength={120}
        es={{ registration: form.register("value.es"), error: errors.value?.es?.message }}
        en={{ registration: form.register("value.en"), error: errors.value?.en?.message }}
      />
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <TextField
          id={`${id}-slug`}
          label={t("valueSlug")}
          hint={ta("slugHint")}
          maxLength={60}
          autoComplete="off"
          error={errors.slug?.message}
          registration={form.register("slug")}
        />
        <TextField
          id={`${id}-position`}
          label={t("position")}
          inputMode="numeric"
          error={errors.position?.message}
          registration={form.register("position")}
        />
      </div>
      <FormActions pending={save.isPending} onCancel={onDone} />
    </form>
  );
}

function AttributeValues({ attribute }: { attribute: AdminAttribute }) {
  const t = useTranslations("Admin.attributes");
  const ta = useTranslations("Admin");
  const locale = useLocale() as Locale;
  const errorMessage = useErrorMessage();
  const remove = useDeleteAttributeValue(attribute.id);
  const [editing, setEditing] = useState<AdminAttributeValue | undefined>();
  const [formKey, setFormKey] = useState(0);
  const reset = () => {
    setEditing(undefined);
    setFormKey((key) => key + 1);
  };

  return (
    <div className="grid gap-4">
      <FormAlert message={remove.error ? errorMessage(remove.error) : undefined} />
      {attribute.values.length === 0 ? (
        <p className="text-muted-foreground">{t("noValues")}</p>
      ) : (
        <ul className="grid gap-2">
          {attribute.values.map((value) => (
            <li key={value.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2">
              <span className="min-w-0 wrap-anywhere">{value.value[locale]}</span>
              <span className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={ta("editItem", { name: value.slug })}
                  onClick={() => setEditing(value)}
                >
                  {ta("edit")}
                </Button>
                <ConfirmAction
                  label={ta("delete")}
                  accessibleLabel={ta("deleteItem", { name: value.slug })}
                  title={ta("deleteTitle", { name: value.slug })}
                  description={t("deleteValueDescription")}
                  confirmLabel={ta("confirmDelete")}
                  pendingLabel={ta("deleting")}
                  cancelLabel={ta("keep")}
                  pending={remove.isPending}
                  size="sm"
                  onConfirm={(done) => remove.mutate(value.id, { onSettled: done })}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
      <h3 className="font-medium">{editing ? t("editValue") : t("addValue")}</h3>
      <ValueForm key={editing?.id ?? `new-${formKey}`} attributeId={attribute.id} value={editing} onDone={reset} />
    </div>
  );
}

export function AttributesView() {
  const t = useTranslations("Admin.attributes");
  const locale = useLocale() as Locale;
  const errorMessage = useErrorMessage();
  const attributes = useAdminAttributes();
  const remove = useDeleteAttribute();
  const sheet = useResourceSheet<AdminAttribute>();
  const values = useResourceSheet<AdminAttribute>();
  const shown = attributes.data?.items.find((attribute) => attribute.id === values.item?.id);

  const columns: Column<AdminAttribute>[] = [
    { header: t("code"), cell: (attribute) => <span className="font-medium">{attribute.code}</span> },
    { header: t("name"), cell: (attribute) => attribute.name[locale] },
    {
      header: t("filterable"),
      cell: (attribute) => (
        <Badge variant={attribute.is_filterable ? "secondary" : "outline"}>
          {t(attribute.is_filterable ? "yes" : "no")}
        </Badge>
      ),
    },
    {
      header: t("values"),
      cell: (attribute) => (
        <Button
          variant="outline"
          size="sm"
          aria-label={t("valuesOf", { name: attribute.code })}
          onClick={() => values.edit(attribute)}
        >
          {t("valueCount", { count: attribute.values.length })}
        </Button>
      ),
    },
    {
      header: t("actions"),
      className: "text-right",
      cell: (attribute) => (
        <RowActions
          name={attribute.code}
          onEdit={() => sheet.edit(attribute)}
          deleteDescription={t("deleteDescription")}
          deleting={remove.isPending}
          onDelete={(done) => remove.mutate(attribute.id, { onSettled: done })}
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
        rowKey={(attribute) => attribute.id}
        query={attributes}
        emptyLabel={t("empty")}
      />
      <ResourceSheet open={sheet.open} title={sheet.item ? t("editTitle") : t("addTitle")} onClose={sheet.close}>
        <AttributeForm
          key={sheet.item?.id ?? "new"}
          attribute={sheet.item}
          onSaved={sheet.close}
          onCancel={sheet.close}
        />
      </ResourceSheet>
      <ResourceSheet
        open={values.open}
        title={t("valuesTitle", { name: shown?.name[locale] ?? "" })}
        onClose={values.close}
      >
        {shown && <AttributeValues attribute={shown} />}
      </ResourceSheet>
    </div>
  );
}
