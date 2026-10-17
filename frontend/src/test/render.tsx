import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import { SessionProvider } from "@/features/session/session-provider";
import { makeQueryClient } from "@/lib/query-client";

import messages from "../../messages/es.json";

export function renderWithProviders(ui: React.ReactElement, { hasSession = false } = {}) {
  const queryClient = makeQueryClient();
  return render(
    <NextIntlClientProvider locale="es" messages={messages} timeZone="America/Argentina/Buenos_Aires">
      <QueryClientProvider client={queryClient}>
        <SessionProvider initialHasSession={hasSession}>{ui}</SessionProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}
