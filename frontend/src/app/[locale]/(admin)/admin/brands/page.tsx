import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { BrandsView } from "@/features/admin/catalog/components/brands-view";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/brands">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Admin.brands" });
  return { title: t("metaTitle") };
}

export default async function AdminBrandsPage({ params }: PageProps<"/[locale]/admin/brands">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  return <BrandsView />;
}
