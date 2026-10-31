import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export function NotFoundView() {
  const t = useTranslations("NotFound");

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-start justify-center gap-4 px-4 py-16">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="text-muted-foreground">{t("description")}</p>
      <Button asChild>
        <Link href="/">{t("home")}</Link>
      </Button>
    </section>
  );
}
