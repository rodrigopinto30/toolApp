import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { ExchangeRatesView } from "@/features/admin/components/exchange-rates-view";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/exchange-rates">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Admin.exchangeRates" });
  return { title: t("metaTitle") };
}

export default async function AdminExchangeRatesPage({ params }: PageProps<"/[locale]/admin/exchange-rates">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  return <ExchangeRatesView />;
}
