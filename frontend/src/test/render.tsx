import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { NuqsTestingAdapter, type OnUrlUpdateFunction } from "nuqs/adapters/testing";

import { SessionProvider } from "@/features/session/session-provider";
import { makeQueryClient } from "@/lib/query-client";

import messages from "../../messages/es.json";

const TIME_ZONE = "America/Argentina/Buenos_Aires";

export function renderWithProviders(ui: React.ReactElement, { hasSession = false } = {}) {
  const queryClient = makeQueryClient();
  return render(
    <NextIntlClientProvider locale="es" messages={messages} timeZone={TIME_ZONE}>
      <QueryClientProvider client={queryClient}>
        <SessionProvider initialHasSession={hasSession}>{ui}</SessionProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

export function renderWithUrl(
  ui: React.ReactElement,
  { searchParams = "", onUrlUpdate }: { searchParams?: string; onUrlUpdate?: OnUrlUpdateFunction } = {},
) {
  return render(
    <NextIntlClientProvider locale="es" messages={messages} timeZone={TIME_ZONE}>
      <QueryClientProvider client={makeQueryClient()}>
        <NuqsTestingAdapter searchParams={searchParams} onUrlUpdate={onUrlUpdate} hasMemory>
          {ui}
        </NuqsTestingAdapter>
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}
