"use client";
"use no memo";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { Controller, useForm, useFormState } from "react-hook-form";

import { CheckboxField } from "@/components/form/checkbox-field";
import { FormAlert } from "@/components/form/form-alert";
import { TextField } from "@/components/form/text-field";
import { FormActions } from "@/features/admin/components/resource-parts";
import { useSavePickupPoint } from "@/features/admin/hooks";
import { OPENING_DAYS, pickupPointSchema, type PickupPointValues } from "@/features/admin/schemas";
import type { AdminPickupPoint } from "@/features/admin/types";
import { useErrorMessage } from "@/features/errors/use-error-message";

type Hours = Record<string, string>;

function isOpeningDay(day: string): boolean {
  return OPENING_DAYS.some((known) => known === day);
}

export function mergeHours(typed: PickupPointValues["hours"], current: Hours | null | undefined): Hours | null {
  const others = Object.entries(current ?? {}).filter(([day]) => !isOpeningDay(day));
  const filled = Object.entries(typed).filter(([, hours]) => hours !== "");
  const merged = [...others, ...filled];
  return merged.length > 0 ? Object.fromEntries(merged) : null;
}

export function PickupPointForm({
  point,
  onSaved,
  onCancel,
}: {
  point?: AdminPickupPoint;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("Admin.pickupPoints");
  const ta = useTranslations("Admin");
  const tv = useTranslations("Validation");
  const id = useId();
  const errorMessage = useErrorMessage();
  const save = useSavePickupPoint(point?.id);
  const form = useForm<PickupPointValues>({
    resolver: zodResolver(pickupPointSchema((key) => tv(key))),
    defaultValues: {
      name: point?.name ?? "",
      address: point?.address ?? "",
      hours: {
        mon_fri: point?.hours?.mon_fri ?? "",
        sat: point?.hours?.sat ?? "",
        sun: point?.hours?.sun ?? "",
      },
      is_active: point?.is_active ?? true,
    },
  });
  const { errors } = useFormState({ control: form.control });

  const onSubmit = form.handleSubmit((values) =>
    save.mutate({ ...values, hours: mergeHours(values.hours, point?.hours) }, { onSuccess: () => onSaved() }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormAlert message={save.error ? errorMessage(save.error) : undefined} />
      <TextField
        id={`${id}-name`}
        label={t("name")}
        maxLength={120}
        error={errors.name?.message}
        registration={form.register("name")}
      />
      <TextField
        id={`${id}-address`}
        label={t("address")}
        maxLength={255}
        error={errors.address?.message}
        registration={form.register("address")}
      />
      <fieldset className="grid gap-4">
        <legend className="text-sm leading-none font-medium">{t("hours")}</legend>
        <div className="grid items-start gap-4 pt-2 sm:grid-cols-3">
          {OPENING_DAYS.map((day) => (
            <TextField
              key={day}
              id={`${id}-${day}`}
              label={t(`days.${day}`)}
              hint={ta("optional")}
              maxLength={80}
              error={errors.hours?.[day]?.message}
              registration={form.register(`hours.${day}`)}
            />
          ))}
        </div>
      </fieldset>
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
