import { isServer, QueryClient } from "@tanstack/react-query";

import { ApiError, isRetryable } from "@/lib/api/errors";

const MAX_RETRIES = 2;
const MAX_RETRY_DELAY_MS = 30_000;

export function retryDelay(attempt: number, error: unknown): number {
  if (error instanceof ApiError && error.retryAfter) {
    return Math.min(error.retryAfter * 1000, MAX_RETRY_DELAY_MS);
  }
  return Math.min(1000 * 2 ** attempt, MAX_RETRY_DELAY_MS);
}

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => failureCount < MAX_RETRIES && isRetryable(error),
        retryDelay,
      },
      mutations: { retry: false },
    },
  });
}

let browserClient: QueryClient | undefined;

export function getQueryClient(): QueryClient {
  if (isServer) {
    return makeQueryClient();
  }
  browserClient ??= makeQueryClient();
  return browserClient;
}
