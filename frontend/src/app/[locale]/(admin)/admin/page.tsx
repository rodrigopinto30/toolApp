import { ADMIN_HOME_PATH } from "@/features/admin/paths";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

export default async function AdminPage({ params }: PageProps<"/[locale]/admin">) {
  const { locale } = await params;
  redirect({ href: ADMIN_HOME_PATH, locale: locale as Locale });
}
