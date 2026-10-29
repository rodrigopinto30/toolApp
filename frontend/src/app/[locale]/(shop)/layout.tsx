import { NextIntlClientProvider } from "next-intl";

import { clientMessages, SHOP_NAMESPACES } from "@/i18n/client-messages";

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  return <NextIntlClientProvider messages={await clientMessages(SHOP_NAMESPACES)}>{children}</NextIntlClientProvider>;
}
