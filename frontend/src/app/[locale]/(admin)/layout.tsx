import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";

import { AdminGate } from "@/features/admin/components/admin-gate";
import { AdminNav } from "@/features/admin/components/admin-nav";
import { ADMIN_NAMESPACES, clientMessages } from "@/i18n/client-messages";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider messages={await clientMessages(ADMIN_NAMESPACES)}>
      <AdminGate>
        <div className="mx-auto grid w-full max-w-7xl flex-1 grid-cols-1 content-start gap-6 px-4 py-8 lg:grid-cols-[13rem_minmax(0,1fr)]">
          <AdminNav />
          <div className="min-w-0">{children}</div>
        </div>
      </AdminGate>
    </NextIntlClientProvider>
  );
}
