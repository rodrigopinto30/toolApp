"use client";
"use no memo";

import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Controller, useForm, useFormState } from "react-hook-form";

import { CheckboxField } from "@/components/form/checkbox-field";
import { FormAlert } from "@/components/form/form-alert";
import { SelectField } from "@/components/form/select-field";
import { TextField } from "@/components/form/text-field";
import { useAdjustStock, useSaveVariant } from "@/features/admin/catalog/hooks";
import {
  NO_VALUE,
  stockSchema,
  variantSchema,
  type StockInput,
  type StockValues,
  type VariantInput,
  type VariantValues,
} from "@/features/admin/catalog/schemas";
import type { AdminAttribute, AdminVariant } from "@/features/admin/catalog/types";
import { FormActions } from "@/features/admin/components/resource-parts";
import { fieldsOf, isTaken } from "@/features/admin/form-errors";
import { useErrorMessage } from "@/features/errors/use-error-message";
import type { Locale } from "@/i18n/locales";
import { ApiError } from "@/lib/api/errors";

const FIELDS = ["sku", "price_usd", "compare_at_price_usd", "position"] as const;

function attributeKey(attribute: AdminAttribute): string {
  return `a${attribute.id}`;
}

function valuesOf(variant: AdminVariant | undefined, attributes: AdminAttribute[]): VariantValues {
  return {
    sku: variant?.sku ?? "",
    price_usd: variant?.price_usd ?? "",
    compare_at_price_usd: variant?.compare_at_price_usd ?? "",
    position: String(variant?.position ?? 0),
    is_active: variant?.is_active ?? true,
    stock: String(variant?.stock ?? 0),
    attributes: Object.fromEntries(
      attributes.map((attribute) => {
        const chosen = attribute.values.find((value) => variant?.attribute_value_ids.includes(value.id));
        return [attributeKey(attribute), chosen ? String(chosen.id) : NO_VALUE];
      }),
    ),
  };
}

function currentVariant(error: unknown): AdminVariant | undefined {
  return error instanceof ApiError && error.code === "version_conflict" ? (error.details as AdminVariant) : undefined;
}

export function VariantForm({
  productId,
  variant,
  attributes,
  onSaved,
  onCancel,
}: {
  productId: number;
  variant?: AdminVariant;
  attributes: AdminAttribute[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("Admin.variants");
  const ta = useTranslations("Admin");
  const tv = useTranslations("Validation");
  const locale = useLocale() as Locale;
  const id = useId();
  const errorMessage = useErrorMessage();
  const save = useSaveVariant(productId, variant?.id);
  const [version, setVersion] = useState(variant?.version);
  const form = useForm<VariantValues, unknown, VariantInput>({
    resolver: zodResolver(variantSchema((key) => tv(key))),
    defaultValues: valuesOf(variant, attributes),
  });
  const { errors } = useFormState({ control: form.control });
  const field = (name: (typeof FIELDS)[number]) => ({
    id: `${id}-${name}`,
    error: errors[name]?.message,
    registration: form.register(name),
  });

  const onSubmit = form.handleSubmit((values) =>
    save.mutate(
      { ...values, version },
      {
        onSuccess: () => onSaved(),
        onError: (error) => {
          const current = currentVariant(error);
          if (current) {
            form.reset(valuesOf(current, attributes));
            setVersion(current.version);
            return;
          }
          fieldsOf(error, FIELDS).forEach((name) =>
            form.setError(name, { message: isTaken(error) ? errorMessage(error) : tv("invalid") }),
          );
        },
      },
    ),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormAlert message={save.error && !isTaken(save.error) ? errorMessage(save.error) : undefined} />
      <TextField label={t("sku")} maxLength={64} autoComplete="off" {...field("sku")} />
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <TextField label={t("price")} hint={t("usdHint")} inputMode="decimal" {...field("price_usd")} />
        <TextField
          label={t("compareAt")}
          hint={ta("optional")}
          inputMode="decimal"
          {...field("compare_at_price_usd")}
        />
      </div>
      {!variant && (
        <TextField
          id={`${id}-stock`}
          label={t("initialStock")}
          inputMode="numeric"
          error={errors.stock?.message}
          registration={form.register("stock")}
        />
      )}
      {attributes.map((attribute) => (
        <Controller
          key={attribute.id}
          control={form.control}
          name={`attributes.${attributeKey(attribute)}`}
          render={({ field: selected }) => (
            <SelectField
              id={`${id}-${attribute.code}`}
              label={attribute.name[locale]}
              options={[
                { value: NO_VALUE, label: t("noOption") },
                ...attribute.values.map((value) => ({ value: String(value.id), label: value.value[locale] })),
              ]}
              value={selected.value}
              onChange={selected.onChange}
            />
          )}
        />
      ))}
      <TextField label={t("position")} inputMode="numeric" {...field("position")} />
      <Controller
        control={form.control}
        name="is_active"
        render={({ field: active }) => (
          <CheckboxField id={`${id}-is_active`} label={ta("isActive")} checked={active.value} onChange={active.onChange} />
        )}
      />
      <FormActions pending={save.isPending} onCancel={onCancel} />
    </form>
  );
}

export function StockForm({
  variant,
  onSaved,
  onCancel,
}: {
  variant: AdminVariant;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("Admin.stock");
  const tv = useTranslations("Validation");
  const id = useId();
  const errorMessage = useErrorMessage();
  const adjust = useAdjustStock(variant.id);
  const form = useForm<StockValues, unknown, StockInput>({
    resolver: zodResolver(stockSchema((key) => tv(key))),
    defaultValues: { delta: "", reason: "" },
  });
  const { errors } = useFormState({ control: form.control });

  const onSubmit = form.handleSubmit((values) => adjust.mutate(values, { onSuccess: () => onSaved() }));

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormAlert message={adjust.error ? errorMessage(adjust.error) : undefined} />
      <p className="text-muted-foreground">{t("current", { stock: variant.stock })}</p>
      <TextField
        id={`${id}-delta`}
        label={t("delta")}
        hint={t("deltaHint")}
        inputMode="numeric"
        error={errors.delta?.message}
        registration={form.register("delta")}
      />
      <TextField
        id={`${id}-reason`}
        label={t("reason")}
        maxLength={255}
        error={errors.reason?.message}
        registration={form.register("reason")}
      />
      <FormActions pending={adjust.isPending} onCancel={onCancel} />
    </form>
  );
}
