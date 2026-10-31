import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { UsersView } from "@/features/admin/operations/components/users-view";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/users">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Admin.users" });
  return { title: t("metaTitle") };
}

export default async function AdminUsersPage({ params }: PageProps<"/[locale]/admin/users">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  return <UsersView />;
}
