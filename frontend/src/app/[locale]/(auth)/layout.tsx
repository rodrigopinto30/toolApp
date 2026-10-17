import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";

import { clientMessages, FORM_NAMESPACES } from "@/i18n/client-messages";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider messages={await clientMessages([...FORM_NAMESPACES, "Auth"])}>
      <section className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
        {children}
      </section>
    </NextIntlClientProvider>
  );
}
