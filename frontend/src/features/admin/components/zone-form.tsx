"use client";
"use no memo";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { Controller, useForm, useFormState } from "react-hook-form";

import { CheckboxField } from "@/components/form/checkbox-field";
import { FormAlert } from "@/components/form/form-alert";
import { TextField } from "@/components/form/text-field";
import { FormActions, I18nFields } from "@/features/admin/components/resource-parts";
import { fieldsOf, isCodeTaken } from "@/features/admin/form-errors";
import { useSaveZone } from "@/features/admin/hooks";
import { zoneSchema, type ZoneInput, type ZoneValues } from "@/features/admin/schemas";
import type { AdminZone } from "@/features/admin/types";
import { useErrorMessage } from "@/features/errors/use-error-message";

const FIELDS = ["code", "cost_usd", "free_over_usd", "eta_min_days", "eta_max_days"] as const;

export function ZoneForm({
  zone,
  onSaved,
  onCancel,
}: {
  zone?: AdminZone;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("Admin.zones");
  const ta = useTranslations("Admin");
  const tv = useTranslations("Validation");
  const id = useId();
  const errorMessage = useErrorMessage();
  const save = useSaveZone(zone?.id);
  const form = useForm<ZoneValues, unknown, ZoneInput>({
    resolver: zodResolver(zoneSchema((key) => tv(key))),
    defaultValues: {
      code: zone?.code ?? "",
      name: zone?.name ?? { es: "", en: "" },
      cost_usd: zone?.cost_usd ?? "",
      free_over_usd: zone?.free_over_usd ?? "",
      eta_min_days: zone?.eta_min_days.toString() ?? "",
      eta_max_days: zone?.eta_max_days.toString() ?? "",
      is_active: zone?.is_active ?? true,
    },
  });
  const { errors } = useFormState({ control: form.control });
  const field = (name: (typeof FIELDS)[number]) => ({
    id: `${id}-${name}`,
    error: errors[name]?.message,
    registration: form.register(name),
  });

  const onSubmit = form.handleSubmit((values) =>
    save.mutate(values, {
      onSuccess: () => onSaved(),
      onError: (error) =>
        fieldsOf(error, FIELDS).forEach((name) =>
          form.setError(name, { message: isCodeTaken(error) ? errorMessage(error) : tv("invalid") }),
        ),
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormAlert message={save.error && !isCodeTaken(save.error) ? errorMessage(save.error) : undefined} />
      <TextField label={t("code")} hint={t("codeHint")} maxLength={40} autoComplete="off" {...field("code")} />
      <I18nFields
        id={`${id}-name`}
        label={t("name")}
        maxLength={120}
        es={{ registration: form.register("name.es"), error: errors.name?.es?.message }}
        en={{ registration: form.register("name.en"), error: errors.name?.en?.message }}
      />
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <TextField label={t("cost")} hint={t("usdHint")} inputMode="decimal" {...field("cost_usd")} />
        <TextField label={t("freeOver")} hint={ta("optional")} inputMode="decimal" {...field("free_over_usd")} />
        <TextField label={t("etaMin")} inputMode="numeric" {...field("eta_min_days")} />
        <TextField label={t("etaMax")} inputMode="numeric" {...field("eta_max_days")} />
      </div>
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
