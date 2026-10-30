import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { OrdersView } from "@/features/orders/components/orders-view";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata({ params }: PageProps<"/[locale]/account/orders">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Orders" });
  return { title: t("metaTitle") };
}

export default async function OrdersPage({ params }: PageProps<"/[locale]/account/orders">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations("Orders");

  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <OrdersView />
    </div>
  );
}
