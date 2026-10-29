import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { NuqsTestingAdapter, type OnUrlUpdateFunction } from "nuqs/adapters/testing";

import { SessionProvider } from "@/features/session/session-provider";
import { makeQueryClient } from "@/lib/query-client";
import { StoreProvider } from "@/stores/store-provider";

import messages from "../../messages/es.json";

const TIME_ZONE = "America/Argentina/Buenos_Aires";

export function renderWithProviders(ui: React.ReactElement, { hasSession = false, searchParams = "" } = {}) {
  const queryClient = makeQueryClient();
  return render(
    <NextIntlClientProvider locale="es" messages={messages} timeZone={TIME_ZONE}>
      <QueryClientProvider client={queryClient}>
        <NuqsTestingAdapter searchParams={searchParams} hasMemory>
          <SessionProvider initialHasSession={hasSession}>
            <StoreProvider>{ui}</StoreProvider>
          </SessionProvider>
        </NuqsTestingAdapter>
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
          <StoreProvider>{ui}</StoreProvider>
        </NuqsTestingAdapter>
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}
