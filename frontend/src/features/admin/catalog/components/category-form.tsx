"use client";
"use no memo";

import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { useId } from "react";
import { Controller, useForm, useFormState } from "react-hook-form";

import { CheckboxField } from "@/components/form/checkbox-field";
import { FormAlert } from "@/components/form/form-alert";
import { SelectField } from "@/components/form/select-field";
import { TextField } from "@/components/form/text-field";
import { TextareaField } from "@/components/form/textarea-field";
import { useSaveCategory } from "@/features/admin/catalog/hooks";
import { categorySchema, NO_VALUE, type CategoryInput, type CategoryValues } from "@/features/admin/catalog/schemas";
import { parentChoices } from "@/features/admin/catalog/tree";
import type { AdminCategory } from "@/features/admin/catalog/types";
import { FormActions, I18nFields } from "@/features/admin/components/resource-parts";
import { fieldsOf, isTaken } from "@/features/admin/form-errors";
import { useErrorMessage } from "@/features/errors/use-error-message";
import type { Locale } from "@/i18n/locales";

const FIELDS = ["slug", "position"] as const;
const DESCRIPTION_MAX_LENGTH = 1000;

export function CategoryForm({
  category,
  categories,
  onSaved,
  onCancel,
}: {
  category?: AdminCategory;
  categories: AdminCategory[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("Admin.categories");
  const ta = useTranslations("Admin");
  const tv = useTranslations("Validation");
  const locale = useLocale() as Locale;
  const id = useId();
  const errorMessage = useErrorMessage();
  const save = useSaveCategory(category?.id);
  const form = useForm<CategoryValues, unknown, CategoryInput>({
    resolver: zodResolver(categorySchema((key) => tv(key))),
    defaultValues: {
      slug: category?.slug ?? "",
      name: category?.name ?? { es: "", en: "" },
      description: category?.description ?? { es: "", en: "" },
      parent_id: category?.parent_id ? String(category.parent_id) : NO_VALUE,
      position: String(category?.position ?? 0),
      is_active: category?.is_active ?? true,
    },
  });
  const { errors } = useFormState({ control: form.control });
  const parents = parentChoices(categories, category).map(({ category: parent, depth }) => ({
    value: String(parent.id),
    label: `${"— ".repeat(depth)}${parent.name[locale]}`,
  }));

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
        id={`${id}-slug`}
        label={t("slug")}
        hint={ta("slugHint")}
        maxLength={120}
        autoComplete="off"
        error={errors.slug?.message}
        registration={form.register("slug")}
      />
      <I18nFields
        id={`${id}-name`}
        label={t("name")}
        maxLength={120}
        es={{ registration: form.register("name.es"), error: errors.name?.es?.message }}
        en={{ registration: form.register("name.en"), error: errors.name?.en?.message }}
      />
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <TextareaField
          id={`${id}-description-es`}
          label={ta("inSpanish", { label: t("description") })}
          hint={ta("optional")}
          maxLength={DESCRIPTION_MAX_LENGTH}
          error={errors.description?.es?.message}
          registration={form.register("description.es")}
        />
        <TextareaField
          id={`${id}-description-en`}
          label={ta("inEnglish", { label: t("description") })}
          hint={ta("optional")}
          maxLength={DESCRIPTION_MAX_LENGTH}
          error={errors.description?.en?.message}
          registration={form.register("description.en")}
        />
      </div>
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <Controller
          control={form.control}
          name="parent_id"
          render={({ field }) => (
            <SelectField
              id={`${id}-parent`}
              label={t("parent")}
              options={[{ value: NO_VALUE, label: t("noParent") }, ...parents]}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
        <TextField
          id={`${id}-position`}
          label={t("position")}
          inputMode="numeric"
          error={errors.position?.message}
          registration={form.register("position")}
        />
      </div>
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
