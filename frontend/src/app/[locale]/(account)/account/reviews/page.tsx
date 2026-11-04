import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { PageHeading } from "@/components/layout/page-heading";
import { ReviewsView } from "@/features/reviews/components/reviews-view";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata({ params }: PageProps<"/[locale]/account/reviews">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "AccountReviews" });
  return { title: t("metaTitle") };
}

export default async function ReviewsPage({ params }: PageProps<"/[locale]/account/reviews">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations("AccountReviews");

  return (
    <div className="grid gap-4">
      <PageHeading>{t("title")}</PageHeading>
      <ReviewsView />
    </div>
  );
}
