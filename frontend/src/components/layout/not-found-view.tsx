import { SearchXIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export function NotFoundView() {
  const t = useTranslations("NotFound");

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-start justify-center gap-4 px-4 py-16">
      <span className="grid size-14 place-items-center rounded-full bg-brand text-brand-foreground">
        <SearchXIcon aria-hidden="true" className="size-7" />
      </span>
      <PageHeading>{t("title")}</PageHeading>
      <p className="text-muted-foreground">{t("description")}</p>
      <Button asChild size="lg">
        <Link href="/">{t("home")}</Link>
      </Button>
    </section>
  );
}
