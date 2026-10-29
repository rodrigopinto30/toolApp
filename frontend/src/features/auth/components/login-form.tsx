"use client";
"use no memo";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useForm, useFormState } from "react-hook-form";

import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { TextField } from "@/components/form/text-field";
import { loginSchema, type LoginValues } from "@/features/auth/schemas";
import { useMergeGuestCart } from "@/features/cart/hooks";
import { useErrorMessage } from "@/features/errors/use-error-message";
import { useLogin } from "@/features/session/hooks";
import { Link } from "@/i18n/navigation";
import { ApiError } from "@/lib/api/errors";
import { useCooldown } from "@/lib/use-cooldown";

export function LoginForm({ next }: { next: string }) {
  const t = useTranslations("Auth.login");
  const tv = useTranslations("Validation");
  const errorMessage = useErrorMessage();
  const cooldown = useCooldown();
  const router = useRouter();
  const login = useLogin();
  const mergeGuestCart = useMergeGuestCart();
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema((key) => tv(key))),
    defaultValues: { email: "", password: "" },
  });
  const { errors } = useFormState({ control: form.control });

  const onSubmit = form.handleSubmit((values) =>
    login.mutate(values, {
      onSuccess: async () => {
        await mergeGuestCart.mutateAsync().catch(() => null);
        router.replace(next);
      },
      onError: (error) => {
        if (error instanceof ApiError && error.retryAfter) {
          cooldown.start(error.retryAfter);
        }
      },
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormAlert message={login.error ? errorMessage(login.error) : undefined} />
      <TextField
        id="email"
        type="email"
        autoComplete="username"
        label={t("email")}
        error={errors.email?.message}
        registration={form.register("email")}
      />
      <TextField
        id="password"
        type="password"
        autoComplete="current-password"
        label={t("password")}
        error={errors.password?.message}
        registration={form.register("password")}
      />
      <SubmitButton
        pending={login.isPending || mergeGuestCart.isPending}
        pendingLabel={t("submitting")}
        disabled={cooldown.active}
      >
        {t("submit")}
      </SubmitButton>
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <Link href="/forgot-password" className="underline underline-offset-4">
          {t("forgot")}
        </Link>
        <p>
          {t("noAccount")}{" "}
          <Link href="/register" className="underline underline-offset-4">
            {t("register")}
          </Link>
        </p>
      </div>
    </form>
  );
}
