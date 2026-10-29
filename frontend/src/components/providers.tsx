"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { NuqsAdapter } from "nuqs/adapters/next/app";

import { SessionProvider } from "@/features/session/session-provider";
import type { Currency } from "@/lib/currency";
import { CurrencyProvider } from "@/lib/currency-context";
import { getQueryClient } from "@/lib/query-client";
import { StoreProvider } from "@/stores/store-provider";

export function Providers({
  hasSession,
  currency,
  children,
}: {
  hasSession: boolean;
  currency: Currency;
  children: React.ReactNode;
}) {
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      <NuqsAdapter>
        <SessionProvider initialHasSession={hasSession}>
          <CurrencyProvider currency={currency}>
            <StoreProvider>{children}</StoreProvider>
          </CurrencyProvider>
        </SessionProvider>
      </NuqsAdapter>
    </QueryClientProvider>
  );
}
