import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { ProductEditor } from "@/features/admin/catalog/components/product-editor";
import { isEntityId } from "@/features/admin/catalog/paths";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/products/[id]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Admin.products" });
  return { title: t("editMetaTitle") };
}

export default async function AdminProductPage({ params }: PageProps<"/[locale]/admin/products/[id]">) {
  const { locale, id } = await params;
  if (!isEntityId(id)) {
    notFound();
  }
  setRequestLocale(locale as Locale);
  return <ProductEditor id={Number(id)} />;
}
