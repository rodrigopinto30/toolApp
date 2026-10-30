import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { BillingBook } from "@/features/account/components/billing-book";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata({ params }: PageProps<"/[locale]/account/billing">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Account.billing" });
  return { title: t("metaTitle") };
}

export default async function BillingPage({ params }: PageProps<"/[locale]/account/billing">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  return <BillingBook />;
}
