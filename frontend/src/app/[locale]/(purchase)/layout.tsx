import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";

import { clientMessages, PURCHASE_NAMESPACES } from "@/i18n/client-messages";

export const metadata: Metadata = { robots: { index: false, follow: true } };

export default async function PurchaseLayout({ children }: { children: React.ReactNode }) {
  return <NextIntlClientProvider messages={await clientMessages(PURCHASE_NAMESPACES)}>{children}</NextIntlClientProvider>;
}
