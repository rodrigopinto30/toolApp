import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { OrderView } from "@/features/admin/operations/components/order-view";
import { isOrderNumber } from "@/features/orders/paths";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/orders/[number]">): Promise<Metadata> {
  const { locale, number } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Orders.detail" });
  return { title: t("metaTitle", { number }) };
}

export default async function AdminOrderPage({ params }: PageProps<"/[locale]/admin/orders/[number]">) {
  const { locale, number } = await params;
  if (!isOrderNumber(number)) {
    notFound();
  }
  setRequestLocale(locale as Locale);
  return <OrderView number={number} />;
}
