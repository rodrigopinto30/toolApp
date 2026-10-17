"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { FormAlert } from "@/components/form/form-alert";
import { Button } from "@/components/ui/button";
import { clearFragment, useFragmentToken } from "@/features/auth/fragment-token";
import { useErrorMessage } from "@/features/errors/use-error-message";
import { useVerifyEmail } from "@/features/session/hooks";
import { useSession } from "@/features/session/session-provider";
import { Link } from "@/i18n/navigation";

export function VerifyEmail() {
  const t = useTranslations("Auth.verify");
  const tErrors = useTranslations("Errors");
  const errorMessage = useErrorMessage();
  const { hasSession } = useSession();
  const token = useFragmentToken();
  const verify = useVerifyEmail();
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) {
      return;
    }
    started.current = true;
    verify.mutate({ token }, { onSettled: clearFragment });
  }, [token, verify]);

  const next = hasSession ? (
    <Button asChild>
      <Link href="/account">{t("toAccount")}</Link>
    </Button>
  ) : (
    <Button asChild>
      <Link href="/login">{t("toLogin")}</Link>
    </Button>
  );

  if (verify.isSuccess) {
    return (
      <div className="grid gap-4">
        <FormAlert tone="success" message={t("success")} />
        {next}
      </div>
    );
  }
  if (verify.isError || token === "") {
    return (
      <div className="grid gap-4">
        <FormAlert message={verify.error ? errorMessage(verify.error) : tErrors("invalid_token")} />
        <p className="text-sm text-muted-foreground">{t("requestNew")}</p>
        {next}
      </div>
    );
  }
  return (
    <p role="status" className="text-muted-foreground">
      {t("verifying")}
    </p>
  );
}
