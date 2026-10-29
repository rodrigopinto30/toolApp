import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { CartView } from "@/features/cart/components/cart-view";
import { getProvinces } from "@/features/catalog/api";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata({ params }: PageProps<"/[locale]/cart">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Cart" });
  return { title: t("metaTitle") };
}

export default async function CartPage({ params }: PageProps<"/[locale]/cart">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const [t, provinces] = await Promise.all([getTranslations("Cart"), getProvinces(locale as Locale)]);

  return (
    <div className="mx-auto grid w-full max-w-5xl flex-1 content-start gap-6 px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <CartView provinces={provinces.map(({ code, name }) => ({ code, name }))} />
    </div>
  );
}
