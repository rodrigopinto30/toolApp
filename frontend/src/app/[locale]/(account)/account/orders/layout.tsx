import { NextIntlClientProvider } from "next-intl";

import { clientMessages, ORDERS_NAMESPACES } from "@/i18n/client-messages";

export default async function OrdersLayout({ children }: { children: React.ReactNode }) {
  return <NextIntlClientProvider messages={await clientMessages(ORDERS_NAMESPACES)}>{children}</NextIntlClientProvider>;
}
