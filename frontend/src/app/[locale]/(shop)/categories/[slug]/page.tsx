import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";

import { JsonLd } from "@/components/seo/json-ld";
import { Button } from "@/components/ui/button";
import { findCategory, getCategoryTree } from "@/features/catalog/api";
import { Breadcrumbs } from "@/features/catalog/components/breadcrumbs";
import { ProductListing, ProductListingSkeleton } from "@/features/catalog/components/product-listing";
import { categoryPath } from "@/features/catalog/paths";
import { loadCatalogSearchParams } from "@/features/catalog/search-params";
import { localizedAlternates } from "@/features/catalog/seo";
import { isSlug } from "@/features/catalog/slug";
import { breadcrumbJsonLd } from "@/features/catalog/structured-data";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { serverEnv } from "@/lib/env";

type Props = PageProps<"/[locale]/categories/[slug]">;

async function resolveCategory(params: Props["params"]) {
  const { locale, slug } = await params;
  if (!isSlug(slug)) {
    return null;
  }
  const found = findCategory(await getCategoryTree(locale as Locale), slug);
  return found && { category: found.category, trail: found.path.slice(0, -1), locale: locale as Locale };
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const resolved = await resolveCategory(params);
  if (!resolved) {
    return {};
  }
  const { page } = await loadCatalogSearchParams(searchParams);
  const alternates = localizedAlternates(categoryPath(resolved.category.slug), resolved.locale, page);
  const description = resolved.category.description ?? undefined;
  return {
    title: resolved.category.name,
    description,
    alternates,
    openGraph: { title: resolved.category.name, description, url: alternates.canonical },
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const resolved = await resolveCategory(params);
  if (!resolved) {
    notFound();
  }
  setRequestLocale(resolved.locale);
  const [t, tBreadcrumbs] = await Promise.all([getTranslations("Category"), getTranslations("Breadcrumbs")]);
  const state = await loadCatalogSearchParams(searchParams);
  const { category } = resolved;
  const trail = resolved.trail.map((node) => ({ name: node.name, href: categoryPath(node.slug) }));
  const children = category.children ?? [];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <Breadcrumbs trail={trail} current={category.name} />
      <header className="grid gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{category.name}</h1>
        {category.description && <p className="max-w-2xl text-muted-foreground">{category.description}</p>}
      </header>
      {children.length > 0 && (
        <nav aria-label={t("subcategories")}>
          <ul className="flex flex-wrap gap-2">
            {children.map((child) => (
              <li key={child.slug}>
                <Button asChild variant="outline" size="sm">
                  <Link href={categoryPath(child.slug)}>{child.name}</Link>
                </Button>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <Suspense fallback={<ProductListingSkeleton />}>
        <ProductListing state={state} path={categoryPath(category.slug)} category={category.slug} />
      </Suspense>
      <JsonLd
        data={breadcrumbJsonLd(serverEnv().PUBLIC_URL, resolved.locale, [
          { name: tBreadcrumbs("home"), href: "/" },
          ...trail,
          { name: category.name, href: categoryPath(category.slug) },
        ])}
      />
    </div>
  );
}
