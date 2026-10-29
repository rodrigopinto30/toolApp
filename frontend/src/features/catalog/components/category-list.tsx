import type { CategoryNode } from "@/features/catalog/types";
import { Link } from "@/i18n/navigation";

export function CategoryList({ categories }: { categories: CategoryNode[] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {categories.map(({ slug, name, description, children = [] }) => (
        <li key={slug} className="flex flex-col gap-2 rounded-xl border p-4">
          <Link href={`/categories/${slug}`} className="font-medium underline-offset-4 hover:underline">
            {name}
          </Link>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
          {children.length > 0 && (
            <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
              {children.map((child) => (
                <li key={child.slug}>
                  <Link
                    href={`/categories/${child.slug}`}
                    className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    {child.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}
