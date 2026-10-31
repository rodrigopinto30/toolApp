import { NextIntlClientProvider } from "next-intl";

import { clientMessages, FAVORITES_NAMESPACES } from "@/i18n/client-messages";

export default async function FavoritesLayout({ children }: { children: React.ReactNode }) {
  return <NextIntlClientProvider messages={await clientMessages(FAVORITES_NAMESPACES)}>{children}</NextIntlClientProvider>;
}
