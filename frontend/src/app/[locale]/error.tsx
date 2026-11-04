"use client";

import { TriangleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const t = useTranslations("Error");

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-start justify-center gap-4 px-4 py-16">
      <span className="grid size-14 place-items-center rounded-full bg-brand text-brand-foreground">
        <TriangleAlertIcon aria-hidden="true" className="size-7" />
      </span>
      <PageHeading>{t("title")}</PageHeading>
      <p className="text-muted-foreground">{t("description")}</p>
      {error.digest && (
        <p className="text-sm text-muted-foreground">{t("reference", { digest: error.digest })}</p>
      )}
      <Button size="lg" onClick={() => retry()}>
        {t("retry")}
      </Button>
    </section>
  );
}
