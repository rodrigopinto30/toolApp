import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { NewProductView } from "@/features/admin/catalog/components/product-editor";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/products/new">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Admin.products" });
  return { title: t("addTitle") };
}

export default async function AdminNewProductPage({ params }: PageProps<"/[locale]/admin/products/new">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  return <NewProductView />;
}
