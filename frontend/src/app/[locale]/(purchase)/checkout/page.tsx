import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { getPickupPoints, getProvinces } from "@/features/catalog/api";
import { CheckoutView } from "@/features/checkout/components/checkout-view";
import { CHECKOUT_NAMESPACES, clientMessages } from "@/i18n/client-messages";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata({ params }: PageProps<"/[locale]/checkout">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Checkout" });
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

export default async function CheckoutPage({ params }: PageProps<"/[locale]/checkout">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const [t, provinces, pickupPoints] = await Promise.all([
    getTranslations("Checkout"),
    getProvinces(locale as Locale),
    getPickupPoints(),
  ]);

  return (
    <NextIntlClientProvider messages={await clientMessages(CHECKOUT_NAMESPACES)}>
      <div className="mx-auto grid w-full max-w-5xl flex-1 content-start gap-6 px-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <CheckoutView provinces={provinces.map(({ code, name }) => ({ code, name }))} pickupPoints={pickupPoints} />
      </div>
    </NextIntlClientProvider>
  );
}
