"use client";

import { useTranslations } from "next-intl";

import { FormAlert } from "@/components/form/form-alert";
import { NotFoundView } from "@/components/layout/not-found-view";
import { Skeleton } from "@/components/ui/skeleton";
import { useErrorMessage } from "@/features/errors/use-error-message";
import { useProtectedMe } from "@/features/session/use-protected-me";

export function AdminGate({ children }: { children: React.ReactNode }) {
  const t = useTranslations("Admin");
  const errorMessage = useErrorMessage();
  const { me, unauthenticated } = useProtectedMe();

  if (me.error && !unauthenticated) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-10">
        <FormAlert message={errorMessage(me.error)} />
      </div>
    );
  }
  if (!me.data) {
    return (
      <div aria-busy="true" aria-label={t("loading")} className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-10">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (me.data.role !== "admin") {
    return <NotFoundView />;
  }
  return children;
}
