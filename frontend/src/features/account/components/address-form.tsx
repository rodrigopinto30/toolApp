"use client";
"use no memo";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { Controller, useForm, useFormState } from "react-hook-form";

import { FormAlert } from "@/components/form/form-alert";
import { SelectField } from "@/components/form/select-field";
import { SubmitButton } from "@/components/form/submit-button";
import { TextField } from "@/components/form/text-field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useSaveAddress } from "@/features/account/hooks";
import { addressSchema, type AddressValues } from "@/features/account/schemas";
import type { ProvinceOption } from "@/features/catalog/components/shipping-quote";
import { invalidFields, useErrorMessage } from "@/features/errors/use-error-message";
import type { components } from "@/lib/api/schema";

export type Address = components["schemas"]["AddressRead"];

const FIELDS = [
  "label",
  "recipient_name",
  "phone",
  "street",
  "number",
  "floor_apt",
  "city",
  "province_code",
  "postal_code",
  "notes",
] as const;

export function AddressForm({
  provinces,
  address,
  defaultValues,
  onSaved,
  onCancel,
}: {
  provinces: ProvinceOption[];
  address?: Address;
  defaultValues?: Partial<AddressValues>;
  onSaved: (address: Address) => void;
  onCancel?: () => void;
}) {
  const t = useTranslations("AddressForm");
  const tv = useTranslations("Validation");
  const id = useId();
  const errorMessage = useErrorMessage();
  const save = useSaveAddress(address?.id);
  const form = useForm<AddressValues>({
    resolver: zodResolver(addressSchema((key) => tv(key))),
    defaultValues: address
      ? {
          label: address.label,
          recipient_name: address.recipient_name,
          phone: address.phone,
          street: address.street,
          number: address.number,
          floor_apt: address.floor_apt ?? "",
          city: address.city,
          province_code: address.province.code,
          postal_code: address.postal_code,
          notes: address.notes ?? "",
          is_default: false,
        }
      : {
          label: "",
          recipient_name: "",
          phone: "",
          street: "",
          number: "",
          floor_apt: "",
          city: "",
          province_code: "",
          postal_code: "",
          notes: "",
          is_default: false,
          ...defaultValues,
        },
  });
  const { errors } = useFormState({ control: form.control });
  const field = (name: (typeof FIELDS)[number]) => ({
    id: `${id}-${name}`,
    error: errors[name]?.message,
    registration: form.register(name),
  });

  const onSubmit = form.handleSubmit((values) =>
    save.mutate(
      { ...values, floor_apt: values.floor_apt || null, notes: values.notes || null },
      {
        onSuccess: (saved) => onSaved(saved),
        onError: (error) =>
          invalidFields(error)
            .filter((name): name is (typeof FIELDS)[number] => FIELDS.some((known) => known === name))
            .forEach((name) => form.setError(name, { message: tv("invalid") })),
      },
    ),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormAlert message={save.error ? errorMessage(save.error) : undefined} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label={t("label")} hint={t("labelHint")} maxLength={40} {...field("label")} />
        <TextField label={t("recipient")} autoComplete="name" {...field("recipient_name")} />
        <TextField label={t("phone")} type="tel" autoComplete="tel" {...field("phone")} />
        <TextField label={t("street")} autoComplete="address-line1" {...field("street")} />
        <TextField label={t("number")} {...field("number")} />
        <TextField label={t("floorApt")} hint={t("optional")} autoComplete="address-line2" {...field("floor_apt")} />
        <TextField label={t("city")} autoComplete="address-level2" {...field("city")} />
        <Controller
          control={form.control}
          name="province_code"
          render={({ field: province }) => (
            <SelectField
              id={`${id}-province_code`}
              label={t("province")}
              placeholder={t("provincePlaceholder")}
              options={provinces.map(({ code, name }) => ({ value: code, label: name }))}
              value={province.value}
              error={errors.province_code?.message}
              onChange={province.onChange}
            />
          )}
        />
        <TextField label={t("postalCode")} autoComplete="postal-code" {...field("postal_code")} />
      </div>
      <TextField label={t("notes")} hint={t("optional")} {...field("notes")} />
      {!address?.is_default && (
        <Controller
          control={form.control}
          name="is_default"
          render={({ field: isDefault }) => (
            <div className="flex items-center gap-2">
              <Checkbox
                id={`${id}-is_default`}
                checked={isDefault.value}
                onCheckedChange={(checked) => isDefault.onChange(checked === true)}
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
