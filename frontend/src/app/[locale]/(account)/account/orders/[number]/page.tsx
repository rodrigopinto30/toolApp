import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { OrderView } from "@/features/orders/components/order-view";
import { isOrderNumber } from "@/features/orders/paths";
import type { Locale } from "@/i18n/routing";

type Props = PageProps<"/[locale]/account/orders/[number]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, number } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Orders.detail" });
  return { title: t("metaTitle", { number }) };
}

export default async function OrderPage({ params }: Props) {
  const { locale, number } = await params;
  if (!isOrderNumber(number)) {
    notFound();
  }
  setRequestLocale(locale as Locale);
  return <OrderView number={number} />;
}
