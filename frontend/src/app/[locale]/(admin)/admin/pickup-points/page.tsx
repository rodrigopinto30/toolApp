import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { PickupPointsView } from "@/features/admin/components/pickup-points-view";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/pickup-points">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Admin.pickupPoints" });
  return { title: t("metaTitle") };
}

export default async function AdminPickupPointsPage({ params }: PageProps<"/[locale]/admin/pickup-points">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  return <PickupPointsView />;
}
