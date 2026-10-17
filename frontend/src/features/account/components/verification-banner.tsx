"use client";

import { useLocale, useTranslations } from "next-intl";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useErrorMessage } from "@/features/errors/use-error-message";
import { useResendVerification } from "@/features/session/hooks";

export function VerificationBanner() {
  const t = useTranslations("Account.verification");
  const locale = useLocale();
  const errorMessage = useErrorMessage();
  const resend = useResendVerification();

  return (
    <Alert role="status">
      <AlertDescription className="grid gap-3">
        <p>{t("pending")}</p>
        {resend.isSuccess && <p>{t("sent")}</p>}
        {resend.error && <p className="text-destructive">{errorMessage(resend.error)}</p>}
        <Button
          variant="outline"
          size="sm"
          className="justify-self-start"
          disabled={resend.isPending || resend.isSuccess}
          onClick={() => resend.mutate(locale)}
        >
          {resend.isPending ? t("resending") : t("resend")}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
