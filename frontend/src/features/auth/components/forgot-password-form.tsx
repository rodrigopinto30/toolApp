"use client";
"use no memo";

import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { useForm, useFormState } from "react-hook-form";

import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { TextField } from "@/components/form/text-field";
import { forgotPasswordSchema, type ForgotPasswordValues } from "@/features/auth/schemas";
import { useErrorMessage } from "@/features/errors/use-error-message";
import { useForgotPassword } from "@/features/session/hooks";
import { Link } from "@/i18n/navigation";
import { ApiError } from "@/lib/api/errors";
import { useCooldown } from "@/lib/use-cooldown";

export function ForgotPasswordForm() {
  const t = useTranslations("Auth.forgot");
  const tv = useTranslations("Validation");
  const locale = useLocale();
  const errorMessage = useErrorMessage();
  const cooldown = useCooldown();
  const forgot = useForgotPassword();
  const form = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema((key) => tv(key))),
    defaultValues: { email: "" },
  });
  const { errors } = useFormState({ control: form.control });

  const onSubmit = form.handleSubmit((values) =>
    forgot.mutate(
      { ...values, locale },
      {
        onError: (error) => {
          if (error instanceof ApiError && error.retryAfter) {
            cooldown.start(error.retryAfter);
          }
        },
      },
    ),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      {forgot.isSuccess ? (
        <FormAlert tone="success" message={t("success")} />
      ) : (
        <FormAlert message={forgot.error ? errorMessage(forgot.error) : undefined} />
      )}
      <TextField
        id="email"
        type="email"
        autoComplete="email"
        label={t("email")}
        error={errors.email?.message}
        registration={form.register("email")}
      />
      <SubmitButton pending={forgot.isPending} pendingLabel={t("submitting")} disabled={cooldown.active}>
        {t("submit")}
      </SubmitButton>
      <Link href="/login" className="text-sm underline underline-offset-4">
        {t("back")}
      </Link>
    </form>
  );
}
