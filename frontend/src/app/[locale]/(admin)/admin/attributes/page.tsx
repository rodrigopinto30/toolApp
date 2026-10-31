import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { AttributesView } from "@/features/admin/catalog/components/attributes-view";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/attributes">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Admin.attributes" });
  return { title: t("metaTitle") };
}

export default async function AdminAttributesPage({ params }: PageProps<"/[locale]/admin/attributes">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  return <AttributesView />;
}
