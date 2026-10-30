"use client";
"use no memo";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { Controller, useForm, useFormState } from "react-hook-form";

import { ChoiceChip } from "@/components/form/choice-chip";
import { FormAlert } from "@/components/form/form-alert";
import { SelectField } from "@/components/form/select-field";
import { SubmitButton } from "@/components/form/submit-button";
import { TextField } from "@/components/form/text-field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useSaveBillingProfile } from "@/features/account/hooks";
import {
  billingProfileSchema,
  TAX_CONDITIONS,
  TAX_ID_TYPES,
  type BillingProfileInput,
  type BillingProfileValues,
} from "@/features/account/schemas";
import { invalidFields, useErrorMessage } from "@/features/errors/use-error-message";
import type { components } from "@/lib/api/schema";

export type BillingProfile = components["schemas"]["BillingProfileRead"];

const FIELDS = ["tax_id_type", "tax_id", "tax_condition", "legal_name", "fiscal_address"] as const;

export function BillingProfileForm({
  profile,
  defaultValues,
  onSaved,
  onCancel,
}: {
  profile?: BillingProfile;
  defaultValues?: Partial<BillingProfileValues>;
  onSaved: (profile: BillingProfile) => void;
  onCancel?: () => void;
}) {
  const t = useTranslations("BillingForm");
  const tv = useTranslations("Validation");
  const id = useId();
  const errorMessage = useErrorMessage();
  const save = useSaveBillingProfile(profile?.id);
  const form = useForm<BillingProfileValues, unknown, BillingProfileInput>({
    resolver: zodResolver(billingProfileSchema((key) => tv(key))),
    defaultValues: profile
      ? {
          tax_id_type: profile.tax_id_type,
          tax_id: profile.tax_id,
          tax_condition: profile.tax_condition,
          legal_name: profile.legal_name,
          fiscal_address: profile.fiscal_address,
          is_default: false,
        }
      : {
          tax_id_type: "CUIT",
          tax_id: "",
          tax_condition: "monotributo",
          legal_name: "",
          fiscal_address: "",
          is_default: false,
          ...defaultValues,
        },
  });
  const { errors } = useFormState({ control: form.control });

  const onSubmit = form.handleSubmit((values) =>
    save.mutate(values, {
      onSuccess: (saved) => onSaved(saved),
      onError: (error) =>
        invalidFields(error)
          .filter((name): name is (typeof FIELDS)[number] => FIELDS.some((known) => known === name))
          .forEach((name) => form.setError(name, { message: tv("invalid") })),
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormAlert message={save.error ? errorMessage(save.error) : undefined} />
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">{t("taxIdType")}</legend>
        <div className="flex flex-wrap gap-2">
          {TAX_ID_TYPES.map((type) => (
            <ChoiceChip key={type} value={type} label={type} {...form.register("tax_id_type")} />
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id={`${id}-tax_id`}
          label={t("taxId")}
          hint={t("taxIdHint")}
          inputMode="numeric"
          error={errors.tax_id?.message}
          registration={form.register("tax_id")}
        />
        <Controller
          control={form.control}
          name="tax_condition"
          render={({ field }) => (
            <SelectField
              id={`${id}-tax_condition`}
              label={t("taxCondition")}
              options={TAX_CONDITIONS.map((condition) => ({ value: condition, label: t(`conditions.${condition}`) }))}
              value={field.value}
              error={errors.tax_condition?.message}
              onChange={field.onChange}
            />
          )}
        />
        <TextField
          id={`${id}-legal_name`}
          label={t("legalName")}
          autoComplete="organization"
          error={errors.legal_name?.message}
          registration={form.register("legal_name")}
        />
        <TextField
          id={`${id}-fiscal_address`}
          label={t("fiscalAddress")}
          error={errors.fiscal_address?.message}
          registration={form.register("fiscal_address")}
        />
      </div>
      {!profile?.is_default && (
        <Controller
          control={form.control}
          name="is_default"
          render={({ field }) => (
            <div className="flex items-center gap-2">
              <Checkbox
                id={`${id}-is_default`}
                checked={field.value}
                onCheckedChange={(checked) => field.onChange(checked === true)}
              />
              <Label htmlFor={`${id}-is_default`}>{t("isDefault")}</Label>
            </div>
          )}
        />
      )}
      <div className="flex flex-wrap gap-2">
        <SubmitButton pending={save.isPending} pendingLabel={t("submitting")}>
          {t("submit")}
        </SubmitButton>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t("cancel")}
          </Button>
        )}
      </div>
    </form>
  );
}
