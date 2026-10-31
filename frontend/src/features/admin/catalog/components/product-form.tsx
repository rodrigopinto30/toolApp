"use client";
"use no memo";

import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Controller, useForm, useFormState } from "react-hook-form";

import { CheckboxField } from "@/components/form/checkbox-field";
import { FormAlert } from "@/components/form/form-alert";
import { SelectField } from "@/components/form/select-field";
import { SubmitButton } from "@/components/form/submit-button";
import { TextField } from "@/components/form/text-field";
import { TextareaField } from "@/components/form/textarea-field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAdminBrands, useAdminCategories } from "@/features/admin/catalog/hooks";
import { NO_VALUE, productSchema, type ProductInput, type ProductValues } from "@/features/admin/catalog/schemas";
import { formatSpecs } from "@/features/admin/catalog/specs";
import { flattenTree } from "@/features/admin/catalog/tree";
import type { AdminProduct } from "@/features/admin/catalog/types";
import { fieldsOf, isTaken } from "@/features/admin/form-errors";
import { useErrorMessage } from "@/features/errors/use-error-message";
import type { Locale } from "@/i18n/locales";

const LOCALES = ["es", "en"] as const;
const FIELDS = ["slug"] as const;

type SaveProduct = {
  error: Error | null;
  isPending: boolean;
  isSuccess: boolean;
  mutate: (
    values: ProductInput,
    options: { onSuccess: (saved: AdminProduct) => void; onError: (error: Error) => void },
  ) => void;
};

function initialValues(product?: AdminProduct): ProductValues {
  const texts = (locale: Locale) => {
    const text = product?.translations[locale];
    return {
      name: text?.name ?? "",
      short_description: text?.short_description ?? "",
      description: text?.description ?? "",
      specs: formatSpecs(text?.specs),
    };
  };
  return {
    slug: product?.slug ?? "",
    category_id: product ? String(product.category_id) : "",
    brand_id: product?.brand_id ? String(product.brand_id) : NO_VALUE,
    is_featured: product?.is_featured ?? false,
    translations: { es: texts("es"), en: texts("en") },
  };
}

export function ProductForm({
  product,
  save,
  onSaved,
}: {
  product?: AdminProduct;
  save: SaveProduct;
  onSaved?: (product: AdminProduct) => void;
}) {
  const t = useTranslations("Admin.products");
  const ta = useTranslations("Admin");
  const tv = useTranslations("Validation");
  const locale = useLocale() as Locale;
  const id = useId();
  const errorMessage = useErrorMessage();
  const categories = useAdminCategories();
  const brands = useAdminBrands();
  const [tab, setTab] = useState<Locale>(locale);
  const form = useForm<ProductValues, unknown, ProductInput>({
    resolver: zodResolver(productSchema((key) => tv(key))),
    defaultValues: initialValues(product),
  });
  const { errors } = useFormState({ control: form.control });
  const categoryOptions = flattenTree(categories.data?.items ?? [])
    .filter(({ category }) => category.is_active || category.id === product?.category_id)
    .map(({ category, depth }) => ({
      value: String(category.id),
      label: `${"— ".repeat(depth)}${category.name[locale]}`,
    }));
  const brandOptions = (brands.data?.items ?? [])
    .filter((brand) => brand.is_active || brand.id === product?.brand_id)
    .map((brand) => ({ value: String(brand.id), label: brand.name }));

  const onSubmit = form.handleSubmit(
    (values) =>
      save.mutate(values, {
        onSuccess: (saved) => onSaved?.(saved),
        onError: (error) =>
          fieldsOf(error, FIELDS).forEach((name) =>
            form.setError(name, { message: isTaken(error) ? errorMessage(error) : tv("invalid") }),
          ),
      }),
    (invalid) => {
      const failing = LOCALES.find((candidate) => invalid.translations?.[candidate]);
      if (failing && !invalid.translations?.[tab]) {
        setTab(failing);
      }
    },
  );

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormAlert message={save.error && !isTaken(save.error) ? errorMessage(save.error) : undefined} />
      <FormAlert tone="success" message={product && save.isSuccess ? t("saved") : undefined} />
      <TextField
        id={`${id}-slug`}
        label={t("slug")}
        hint={product ? t("slugWarning") : ta("slugHint")}
        maxLength={160}
        autoComplete="off"
        error={errors.slug?.message}
        registration={form.register("slug")}
      />
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <Controller
          control={form.control}
          name="category_id"
          render={({ field }) => (
            <SelectField
              id={`${id}-category`}
              label={t("category")}
              placeholder={t("categoryPlaceholder")}
              options={categoryOptions}
              value={field.value}
              error={errors.category_id?.message}
              onChange={field.onChange}
            />
          )}
        />
        <Controller
          control={form.control}
          name="brand_id"
          render={({ field }) => (
            <SelectField
              id={`${id}-brand`}
              label={t("brand")}
              options={[{ value: NO_VALUE, label: t("noBrand") }, ...brandOptions]}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
      </div>
      <Controller
        control={form.control}
        name="is_featured"
        render={({ field }) => (
          <CheckboxField id={`${id}-featured`} label={t("isFeatured")} checked={field.value} onChange={field.onChange} />
        )}
      />
      <Tabs value={tab} onValueChange={(value) => setTab(value as Locale)}>
        <TabsList aria-label={t("textsLabel")}>
          {LOCALES.map((code) => (
            <TabsTrigger key={code} value={code}>
              {t(`languages.${code}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        {LOCALES.map((code) => (
          <TabsContent key={code} value={code} forceMount className="grid gap-4 data-[state=inactive]:hidden">
            <TextField
              id={`${id}-${code}-name`}
              label={t("name")}
              maxLength={200}
              error={errors.translations?.[code]?.name?.message}
              registration={form.register(`translations.${code}.name`)}
            />
            <TextareaField
              id={`${id}-${code}-short`}
              label={t("shortDescription")}
              maxLength={500}
              rows={2}
              error={errors.translations?.[code]?.short_description?.message}
              registration={form.register(`translations.${code}.short_description`)}
            />
            <TextareaField
              id={`${id}-${code}-description`}
              label={t("description")}
              maxLength={10_000}
              rows={6}
              error={errors.translations?.[code]?.description?.message}
              registration={form.register(`translations.${code}.description`)}
            />
            <TextareaField
              id={`${id}-${code}-specs`}
              label={t("specs")}
              hint={t("specsHint")}
              rows={4}
              error={errors.translations?.[code]?.specs?.message}
              registration={form.register(`translations.${code}.specs`)}
            />
          </TabsContent>
        ))}
      </Tabs>
      <div>
        <SubmitButton pending={save.isPending} pendingLabel={ta("saving")}>
          {ta("save")}
        </SubmitButton>
      </div>
    </form>
  );
}
