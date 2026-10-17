"use client";
"use no memo";

import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { useForm, useFormState } from "react-hook-form";

import { FormAlert } from "@/components/form/form-alert";
import { TextField } from "@/components/form/text-field";
import { Button } from "@/components/ui/button";
import { registerSchema, type RegisterValues } from "@/features/auth/schemas";
import { invalidFields, useErrorMessage } from "@/features/errors/use-error-message";
import { useRegister } from "@/features/session/hooks";
import { Link } from "@/i18n/navigation";
import { ApiError } from "@/lib/api/errors";
import { useCooldown } from "@/lib/use-cooldown";

const FIELDS = ["first_name", "last_name", "email", "password"] as const;

export function RegisterForm() {
  const t = useTranslations("Auth.register");
  const tv = useTranslations("Validation");
  const locale = useLocale();
  const errorMessage = useErrorMessage();
  const cooldown = useCooldown();
  const register = useRegister();
  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema((key) => tv(key))),
    defaultValues: { first_name: "", last_name: "", email: "", password: "" },
  });
  const { errors } = useFormState({ control: form.control });

  const onSubmit = form.handleSubmit((values) =>
    register.mutate(
      { ...values, locale },
      {
        onError: (error) => {
          invalidFields(error)
            .filter((field): field is (typeof FIELDS)[number] => FIELDS.some((name) => name === field))
            .forEach((field) => form.setError(field, { message: tv("invalid") }));
          if (error instanceof ApiError && error.retryAfter) {
            cooldown.start(error.retryAfter);
          }
        },
      },
    ),
  );

  if (register.isSuccess) {
    return (
      <div role="status" className="grid gap-2">
        <h2 className="text-lg font-semibold">{t("successTitle")}</h2>
        <p className="text-muted-foreground">{t("successBody", { email: register.variables.email })}</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormAlert message={register.error ? errorMessage(register.error) : undefined} />
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
        id="email"
        type="email"
        autoComplete="email"
        label={t("email")}
        error={errors.email?.message}
        registration={form.register("email")}
      />
      <TextField
        id="password"
        type="password"
        autoComplete="new-password"
        label={t("password")}
        hint={t("passwordHint")}
        error={errors.password?.message}
        registration={form.register("password")}
      />
      <Button type="submit" disabled={register.isPending || cooldown.active}>
        {register.isPending ? t("submitting") : t("submit")}
      </Button>
      <p className="text-sm">
        {t("hasAccount")}{" "}
        <Link href="/login" className="underline underline-offset-4">
          {t("login")}
        </Link>
      </p>
    </form>
  );
}
