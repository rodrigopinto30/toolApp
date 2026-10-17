"use client";

import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect } from "react";

import { FormAlert } from "@/components/form/form-alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PasswordForm } from "@/features/account/components/password-form";
import { ProfileForm } from "@/features/account/components/profile-form";
import { VerificationBanner } from "@/features/account/components/verification-banner";
import { useErrorMessage } from "@/features/errors/use-error-message";
import { useLogout, useMe } from "@/features/session/hooks";
import { useSession } from "@/features/session/session-provider";
import { ApiError } from "@/lib/api/errors";

export function AccountView() {
  const t = useTranslations("Account");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const { hasSession } = useSession();
  const me = useMe();
  const logout = useLogout();
  const unauthenticated = !hasSession || (me.error instanceof ApiError && me.error.status === 401);

  useEffect(() => {
    if (unauthenticated) {
      router.replace(`/${locale}/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [unauthenticated, router, locale, pathname]);

  if (me.error && !unauthenticated) {
    return <FormAlert message={errorMessage(me.error)} />;
  }
  if (!me.data) {
    return (
      <div aria-busy="true" aria-label={t("loading")} className="grid gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <Button variant="outline" disabled={logout.isPending} onClick={() => logout.mutate()}>
          {t("logout")}
        </Button>
      </div>
      {!me.data.email_verified && <VerificationBanner />}
      <Card>
        <CardHeader>
          <CardTitle>
            <h2 className="text-lg font-semibold">{t("profile.title")}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileForm key={me.data.id} me={me.data} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2 className="text-lg font-semibold">{t("password.title")}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <PasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
