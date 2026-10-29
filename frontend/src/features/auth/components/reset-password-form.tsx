"use client";
"use no memo";

import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { useForm, useFormState } from "react-hook-form";

import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { TextField } from "@/components/form/text-field";
import { Button } from "@/components/ui/button";
import { clearFragment, useFragmentToken } from "@/features/auth/fragment-token";
import { resetPasswordSchema, type ResetPasswordValues } from "@/features/auth/schemas";
import { useErrorMessage } from "@/features/errors/use-error-message";
import { useResetPassword } from "@/features/session/hooks";
import { Link } from "@/i18n/navigation";

export function ResetPasswordForm() {
  const t = useTranslations("Auth.reset");
  const tv = useTranslations("Validation");
  const locale = useLocale();
  const errorMessage = useErrorMessage();
  const token = useFragmentToken();
  const reset = useResetPassword();
  const form = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema((key) => tv(key))),
    defaultValues: { password: "", confirm: "" },
  });
  const { errors } = useFormState({ control: form.control });

  if (reset.isSuccess) {
    return (
      <div className="grid gap-4">
        <FormAlert tone="success" message={t("success")} />
        <Button asChild>
          <Link href="/login">{t("toLogin")}</Link>
        </Button>
      </div>
    );
  }

  if (token === "") {
    return (
      <div className="grid gap-4">
        <FormAlert message={t("missingToken")} />
        <Button asChild variant="outline">
          <Link href="/forgot-password">{t("requestNew")}</Link>
        </Button>
      </div>
    );
  }

  const onSubmit = form.handleSubmit(({ password }) =>
    reset.mutate({ token: token ?? "", password, locale }, { onSuccess: clearFragment }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormAlert message={reset.error ? errorMessage(reset.error) : undefined} />
      <TextField
        id="password"
        type="password"
        autoComplete="new-password"
        label={t("password")}
        hint={t("hint")}
        error={errors.password?.message}
        registration={form.register("password")}
      />
      <TextField
        id="confirm"
        type="password"
        autoComplete="new-password"
        label={t("confirm")}
        error={errors.confirm?.message}
        registration={form.register("confirm")}
      />
      <SubmitButton pending={reset.isPending} pendingLabel={t("submitting")} disabled={token === null}>
        {t("submit")}
      </SubmitButton>
      {reset.isError && (
        <Link href="/forgot-password" className="text-sm underline underline-offset-4">
          {t("requestNew")}
        </Link>
      )}
    </form>
  );
}
