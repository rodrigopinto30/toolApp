"use client";
"use no memo";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { Controller, useForm, useFormState } from "react-hook-form";

import { CheckboxField } from "@/components/form/checkbox-field";
import { FormAlert } from "@/components/form/form-alert";
import { SelectField } from "@/components/form/select-field";
import { TextField } from "@/components/form/text-field";
import { FormActions } from "@/features/admin/components/resource-parts";
import { toLocalInput } from "@/features/admin/dates";
import { fieldsOf, isTaken } from "@/features/admin/form-errors";
import { useSaveCoupon } from "@/features/admin/hooks";
import { COUPON_TYPES, couponSchema, type CouponInput, type CouponValues } from "@/features/admin/schemas";
import type { AdminCoupon } from "@/features/admin/types";
import { useErrorMessage } from "@/features/errors/use-error-message";

const FIELDS = [
  "code",
  "value",
  "min_subtotal_usd",
  "starts_at",
  "ends_at",
  "max_uses",
  "max_uses_per_user",
] as const;

function initialValues(coupon?: AdminCoupon): CouponValues {
  return {
    code: coupon?.code ?? "",
    type: coupon?.type ?? "percent",
    value: coupon?.value ?? "",
    min_subtotal_usd: coupon?.min_subtotal_usd ?? "",
    starts_at: toLocalInput(coupon?.starts_at ?? new Date().toISOString()),
    ends_at: coupon?.ends_at ? toLocalInput(coupon.ends_at) : "",
    max_uses: coupon?.max_uses?.toString() ?? "",
    max_uses_per_user: coupon?.max_uses_per_user?.toString() ?? "",
    is_active: coupon?.is_active ?? true,
  };
}

export function CouponForm({
  coupon,
  onSaved,
  onCancel,
}: {
  coupon?: AdminCoupon;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("Admin.coupons");
  const ta = useTranslations("Admin");
  const tv = useTranslations("Validation");
  const id = useId();
  const errorMessage = useErrorMessage();
  const save = useSaveCoupon(coupon?.id);
  const form = useForm<CouponValues, unknown, CouponInput>({
    resolver: zodResolver(couponSchema((key) => tv(key))),
    defaultValues: initialValues(coupon),
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
          form.setError(name, { message: isTaken(error) ? errorMessage(error) : tv("invalid") }),
        ),
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormAlert message={save.error && !isTaken(save.error) ? errorMessage(save.error) : undefined} />
      <TextField label={t("code")} hint={t("codeHint")} maxLength={40} autoComplete="off" {...field("code")} />
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <Controller
          control={form.control}
          name="type"
          render={({ field: type }) => (
            <SelectField
              id={`${id}-type`}
              label={t("type")}
              options={COUPON_TYPES.map((value) => ({ value, label: t(`types.${value}`) }))}
              value={type.value}
              onChange={type.onChange}
            />
          )}
        />
        <TextField label={t("value")} hint={t("valueHint")} inputMode="decimal" {...field("value")} />
      </div>
      <TextField
        label={t("minSubtotal")}
        hint={ta("optional")}
        inputMode="decimal"
        {...field("min_subtotal_usd")}
      />
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <TextField label={t("startsAt")} type="datetime-local" {...field("starts_at")} />
        <TextField label={t("endsAt")} hint={ta("optional")} type="datetime-local" {...field("ends_at")} />
      </div>
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <TextField label={t("maxUses")} hint={ta("optional")} inputMode="numeric" {...field("max_uses")} />
        <TextField
          label={t("maxUsesPerUser")}
          hint={ta("optional")}
          inputMode="numeric"
          {...field("max_uses_per_user")}
        />
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
