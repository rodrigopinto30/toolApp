"use client";
"use no memo";

import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { useForm, useFormState } from "react-hook-form";

import { FormAlert } from "@/components/form/form-alert";
import { TextField } from "@/components/form/text-field";
import { Button } from "@/components/ui/button";
import { useChangePassword } from "@/features/account/hooks";
import { passwordChangeSchema, type PasswordChangeValues } from "@/features/account/schemas";
import { useErrorMessage } from "@/features/errors/use-error-message";
import { ApiError } from "@/lib/api/errors";

export function PasswordForm() {
  const t = useTranslations("Account.password");
  const tv = useTranslations("Validation");
  const locale = useLocale();
  const errorMessage = useErrorMessage();
  const change = useChangePassword();
  const form = useForm<PasswordChangeValues>({
    resolver: zodResolver(passwordChangeSchema((key) => tv(key))),
    defaultValues: { current_password: "", new_password: "", confirm: "" },
  });
  const { errors } = useFormState({ control: form.control });

  const onSubmit = form.handleSubmit(({ current_password, new_password }) =>
    change.mutate(
      { current_password, new_password, locale },
      {
        onSuccess: () => form.reset(),
        onError: (error) => {
          if (error instanceof ApiError && error.code === "invalid_current_password") {
            form.setError("current_password", { message: errorMessage(error) });
          }
        },
      },
    ),
  );

  const generalError =
    change.error instanceof ApiError && change.error.code === "invalid_current_password"
      ? undefined
      : change.error
        ? errorMessage(change.error)
        : undefined;

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      {change.isSuccess ? (
        <FormAlert tone="success" message={t("saved")} />
      ) : (
        <FormAlert message={generalError} />
      )}
      <TextField
        id="current_password"
        type="password"
        autoComplete="current-password"
        label={t("current")}
        error={errors.current_password?.message}
        registration={form.register("current_password")}
      />
      <TextField
        id="new_password"
        type="password"
        autoComplete="new-password"
        label={t("new")}
        hint={t("hint")}
        error={errors.new_password?.message}
        registration={form.register("new_password")}
      />
      <TextField
        id="confirm"
        type="password"
        autoComplete="new-password"
        label={t("confirm")}
        error={errors.confirm?.message}
        registration={form.register("confirm")}
      />
      <Button type="submit" disabled={change.isPending} className="justify-self-start">
        {change.isPending ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
