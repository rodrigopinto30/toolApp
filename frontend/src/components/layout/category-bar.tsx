import { useTranslations } from "next-intl";

import { categoryPath } from "@/features/catalog/paths";
import { Link } from "@/i18n/navigation";

export function CategoryBar({ categories }: { categories: { slug: string; name: string }[] }) {
  const t = useTranslations("CategoryBar");

  return (
    <nav aria-label={t("label")} className="bg-chrome-secondary">
      <ul className="mx-auto flex w-full max-w-5xl gap-1 overflow-x-auto px-2">
        {categories.map((category) => (
          <li key={category.slug} className="shrink-0">
            <Link
              href={categoryPath(category.slug)}
              className="block rounded-sm px-2 py-2.5 font-heading text-sm font-semibold whitespace-nowrap transition-colors hover:text-brand focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
            >
              {category.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
