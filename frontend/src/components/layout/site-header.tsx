import { getLocale, getTranslations } from "next-intl/server";

import { CategoryMenu, type CategoryLink } from "@/components/layout/category-menu";
import { CurrencySwitcher } from "@/components/layout/currency-switcher";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { SearchBox } from "@/components/layout/search-box";
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
    <header className="border-b">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-2 px-4 py-2 sm:flex-nowrap sm:gap-4">
        <Link href="/" aria-label={t("home")} className="text-lg font-semibold tracking-tight">
          ToolApp
        </Link>
        {categories.length > 0 && <CategoryMenu categories={categories} />}
        <SearchBox className="order-last w-full sm:order-none sm:w-auto sm:flex-1" />
        <div className="ml-auto flex items-center gap-1">
          <CurrencySwitcher value={currency} />
          <LocaleSwitcher />
          <CartLink />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
