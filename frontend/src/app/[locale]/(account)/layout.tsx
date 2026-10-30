import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";

import { AccountNav } from "@/features/account/components/account-nav";
import { clientMessages, FORM_NAMESPACES } from "@/i18n/client-messages";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider messages={await clientMessages([...FORM_NAMESPACES, "Account"])}>
      <section className="mx-auto grid w-full max-w-3xl flex-1 content-start gap-6 px-4 py-10">
        <AccountNav />
        {children}
      </section>
    </NextIntlClientProvider>
  );
}
