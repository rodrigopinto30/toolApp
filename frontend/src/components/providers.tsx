"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { NuqsAdapter } from "nuqs/adapters/next/app";

import { SessionProvider } from "@/features/session/session-provider";
import { getQueryClient } from "@/lib/query-client";

export function Providers({ hasSession, children }: { hasSession: boolean; children: React.ReactNode }) {
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      <NuqsAdapter>
        <SessionProvider initialHasSession={hasSession}>{children}</SessionProvider>
      </NuqsAdapter>
    </QueryClientProvider>
  );
}
