import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { CouponsView } from "@/features/admin/components/coupons-view";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/coupons">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Admin.coupons" });
  return { title: t("metaTitle") };
}

export default async function AdminCouponsPage({ params }: PageProps<"/[locale]/admin/coupons">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  return <CouponsView />;
}
