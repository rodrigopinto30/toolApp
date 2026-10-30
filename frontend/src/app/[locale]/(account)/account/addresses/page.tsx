import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { AddressBook } from "@/features/account/components/address-book";
import { getProvinces } from "@/features/catalog/api";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata({ params }: PageProps<"/[locale]/account/addresses">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Account.addresses" });
  return { title: t("metaTitle") };
}

export default async function AddressesPage({ params }: PageProps<"/[locale]/account/addresses">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const provinces = await getProvinces(locale as Locale);
  return <AddressBook provinces={provinces.map(({ code, name }) => ({ code, name }))} />;
}
