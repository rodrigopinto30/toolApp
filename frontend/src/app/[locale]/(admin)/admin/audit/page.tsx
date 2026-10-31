import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { AuditView } from "@/features/admin/components/audit-view";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/audit">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Admin.audit" });
  return { title: t("metaTitle") };
}

export default async function AdminAuditPage({ params }: PageProps<"/[locale]/admin/audit">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  return <AuditView />;
}
