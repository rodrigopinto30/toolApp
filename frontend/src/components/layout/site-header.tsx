import { getLocale, getTranslations } from "next-intl/server";

import { CategoryBar } from "@/components/layout/category-bar";
import { CategoryMenu, type CategoryLink } from "@/components/layout/category-menu";
import { CurrencySwitcher } from "@/components/layout/currency-switcher";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { SearchBox } from "@/components/layout/search-box";
import { TrustStrip } from "@/components/layout/trust-strip";
import { UserMenu } from "@/components/layout/user-menu";
import { CartLink } from "@/features/cart/components/cart-link";
import { getCategoryTree } from "@/features/catalog/api";
import { Link } from "@/i18n/navigation";
import type { Currency } from "@/lib/currency";

async function categoryLinks(): Promise<CategoryLink[]> {
  try {
    const tree = await getCategoryTree(await getLocale());
    return tree.map(({ slug, name, children = [] }) => ({
      slug,
      name,
      children: children.map((child) => ({ slug: child.slug, name: child.name })),
    }));
  } catch {
    return [];
  }
}

export async function SiteHeader({ currency }: { currency: Currency }) {
  const t = await getTranslations("Layout");
  const categories = await categoryLinks();

  return (
    <header className="bg-chrome text-chrome-foreground">
      <div className="border-b-4 border-brand">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-1 gap-y-3 px-4 py-3 lg:flex-nowrap lg:gap-4">
          <Link
            href="/"
            aria-label={t("home")}
            className="mr-auto rounded-sm font-heading text-xl font-extrabold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand sm:text-2xl"
          >
            ToolApp
          </Link>
          <div className="order-last flex w-full items-center gap-2 lg:order-none lg:flex-1">
            {categories.length > 0 && <CategoryMenu categories={categories} />}
            <SearchBox className="flex-1" />
          </div>
          <div className="flex items-center gap-1">
            <CurrencySwitcher value={currency} />
            <LocaleSwitcher />
            <CartLink />
            <UserMenu />
          </div>
        </div>
      </div>
      {categories.length > 0 && <CategoryBar categories={categories} />}
      <TrustStrip />
    </header>
  );
}
