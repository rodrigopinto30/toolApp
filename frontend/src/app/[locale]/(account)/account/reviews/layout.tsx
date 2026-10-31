import { NextIntlClientProvider } from "next-intl";

import { clientMessages, REVIEWS_NAMESPACES } from "@/i18n/client-messages";

export default async function ReviewsLayout({ children }: { children: React.ReactNode }) {
  return <NextIntlClientProvider messages={await clientMessages(REVIEWS_NAMESPACES)}>{children}</NextIntlClientProvider>;
}
