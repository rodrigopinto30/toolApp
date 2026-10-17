import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { AuthCard } from "@/features/auth/components/auth-card";
import { VerifyEmail } from "@/features/auth/components/verify-email";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata({ params }: PageProps<"/[locale]/verify-email">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Auth.verify" });
  return { title: t("metaTitle") };
}

export default async function VerifyEmailPage({ params }: PageProps<"/[locale]/verify-email">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations("Auth.verify");

  return (
    <AuthCard title={t("title")}>
      <VerifyEmail />
    </AuthCard>
  );
}
