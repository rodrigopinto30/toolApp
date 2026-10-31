import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { OrdersView } from "@/features/admin/operations/components/orders-view";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/orders">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Admin.orders" });
  return { title: t("metaTitle") };
}

export default async function AdminOrdersPage({ params }: PageProps<"/[locale]/admin/orders">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  return <OrdersView />;
}
