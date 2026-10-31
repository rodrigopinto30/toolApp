import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { ShippingView } from "@/features/admin/components/shipping-view";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/shipping">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Admin.zones" });
  return { title: t("metaTitle") };
}

export default async function AdminShippingPage({ params }: PageProps<"/[locale]/admin/shipping">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  return <ShippingView />;
}
