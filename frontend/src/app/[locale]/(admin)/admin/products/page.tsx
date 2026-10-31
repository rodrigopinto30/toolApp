import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { ProductsView } from "@/features/admin/catalog/components/products-view";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/products">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Admin.products" });
  return { title: t("metaTitle") };
}

export default async function AdminProductsPage({ params }: PageProps<"/[locale]/admin/products">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  return <ProductsView />;
}
