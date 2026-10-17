import { getTranslations } from "next-intl/server";

import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { Link } from "@/i18n/navigation";

export async function SiteHeader() {
  const t = await getTranslations("Layout");

  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-4">
        <Link href="/" aria-label={t("home")} className="text-lg font-semibold tracking-tight">
          ToolApp
        </Link>
        <LocaleSwitcher />
      </div>
    </header>
  );
}
