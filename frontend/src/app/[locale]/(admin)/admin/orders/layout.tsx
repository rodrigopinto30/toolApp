import { NextIntlClientProvider } from "next-intl";

import { ADMIN_ORDERS_NAMESPACES, clientMessages } from "@/i18n/client-messages";

export default async function AdminOrdersLayout({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider messages={await clientMessages(ADMIN_ORDERS_NAMESPACES)}>{children}</NextIntlClientProvider>
  );
}
