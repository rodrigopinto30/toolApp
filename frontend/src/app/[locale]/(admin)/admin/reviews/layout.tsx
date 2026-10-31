import { NextIntlClientProvider } from "next-intl";

import { ADMIN_REVIEWS_NAMESPACES, clientMessages } from "@/i18n/client-messages";

export default async function AdminReviewsLayout({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider messages={await clientMessages(ADMIN_REVIEWS_NAMESPACES)}>{children}</NextIntlClientProvider>
  );
}
