import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { FavoritesView } from "@/features/favorites/components/favorites-view";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata({ params }: PageProps<"/[locale]/account/favorites">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Favorites" });
  return { title: t("metaTitle") };
}

export default async function FavoritesPage({ params }: PageProps<"/[locale]/account/favorites">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations("Favorites");

  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <FavoritesView />
    </div>
  );
}
