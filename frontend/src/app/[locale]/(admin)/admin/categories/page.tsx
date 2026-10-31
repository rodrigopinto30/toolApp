import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { CategoriesView } from "@/features/admin/catalog/components/categories-view";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/categories">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Admin.categories" });
  return { title: t("metaTitle") };
}

export default async function AdminCategoriesPage({ params }: PageProps<"/[locale]/admin/categories">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  return <CategoriesView />;
}
