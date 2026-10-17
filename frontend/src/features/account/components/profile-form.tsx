"use client";
"use no memo";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useForm, useFormState } from "react-hook-form";

import { FormAlert } from "@/components/form/form-alert";
import { TextField } from "@/components/form/text-field";
import { Button } from "@/components/ui/button";
import { useUpdateProfile } from "@/features/account/hooks";
import { profileSchema, type ProfileValues } from "@/features/account/schemas";
import { invalidFields, useErrorMessage } from "@/features/errors/use-error-message";
import type { components } from "@/lib/api/schema";

const FIELDS = ["first_name", "last_name", "phone"] as const;

export function ProfileForm({ me }: { me: components["schemas"]["MeRead"] }) {
  const t = useTranslations("Account.profile");
  const tv = useTranslations("Validation");
  const errorMessage = useErrorMessage();
  const update = useUpdateProfile();
  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema((key) => tv(key))),
    defaultValues: { first_name: me.first_name, last_name: me.last_name, phone: me.phone ?? "" },
  });
  const { errors, isDirty } = useFormState({ control: form.control });

  const onSubmit = form.handleSubmit((values) =>
    update.mutate(
      { first_name: values.first_name, last_name: values.last_name, phone: values.phone || null },
      {
        onSuccess: (user) =>
          form.reset({ first_name: user.first_name, last_name: user.last_name, phone: user.phone ?? "" }),
        onError: (error) =>
          invalidFields(error)
            .filter((field): field is (typeof FIELDS)[number] => FIELDS.some((name) => name === field))
            .forEach((field) => form.setError(field, { message: tv("invalid") })),
      },
    ),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      {update.isSuccess && !isDirty ? (
        <FormAlert tone="success" message={t("saved")} />
      ) : (
        <FormAlert message={update.error ? errorMessage(update.error) : undefined} />
      )}
      <div className="grid gap-1">
        <p className="text-sm font-medium">{t("email")}</p>
        <p className="text-sm text-muted-foreground">{me.email}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="first_name"
          autoComplete="given-name"
          label={t("firstName")}
          error={errors.first_name?.message}
          registration={form.register("first_name")}
        />
        <TextField
          id="last_name"
          autoComplete="family-name"
          label={t("lastName")}
          error={errors.last_name?.message}
          registration={form.register("last_name")}
        />
      </div>
      <TextField
        id="phone"
        type="tel"
        autoComplete="tel"
        label={t("phone")}
        hint={t("phoneHint")}
        error={errors.phone?.message}
        registration={form.register("phone")}
      />
      <Button type="submit" disabled={update.isPending || !isDirty} className="justify-self-start">
        {update.isPending ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
