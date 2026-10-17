import { getTranslations } from "next-intl/server";

import { CurrencySwitcher } from "@/components/layout/currency-switcher";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { UserMenu } from "@/components/layout/user-menu";
import { Link } from "@/i18n/navigation";
import type { Currency } from "@/lib/currency";

export async function SiteHeader({ currency }: { currency: Currency }) {
  const t = await getTranslations("Layout");

  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-4">
        <Link href="/" aria-label={t("home")} className="text-lg font-semibold tracking-tight">
          ToolApp
        </Link>
        <div className="flex items-center gap-1">
          <CurrencySwitcher value={currency} />
          <LocaleSwitcher />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
