import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { AuthCard } from "@/features/auth/components/auth-card";
import { LoginForm } from "@/features/auth/components/login-form";
import type { Locale } from "@/i18n/routing";
import { safeRedirect } from "@/lib/safe-redirect";

export async function generateMetadata({ params }: PageProps<"/[locale]/login">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Auth.login" });
  return { title: t("metaTitle") };
}

export default async function LoginPage({ params, searchParams }: PageProps<"/[locale]/login">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const { next } = await searchParams;
  const t = await getTranslations("Auth.login");

  return (
    <AuthCard title={t("title")} description={t("description")}>
      <LoginForm next={safeRedirect(typeof next === "string" ? next : undefined, locale as Locale)} />
    </AuthCard>
  );
}
