import "server-only";

import createClient from "openapi-fetch";

import { serverEnv } from "@/lib/env";

import type { paths } from "./schema";

const TIMEOUT_MS = 5_000;
export const PUBLIC_REVALIDATE_SECONDS = 60;

export function publicCache(tags: string[]) {
  return { next: { revalidate: PUBLIC_REVALIDATE_SECONDS, tags } };
}

type RequestWithCacheOptions = Request & { next?: NextFetchRequestConfig };

let client: ReturnType<typeof createClient<paths>> | undefined;

export function serverApi() {
  client ??= createClient<paths>({
    baseUrl: serverEnv().INTERNAL_API_ORIGIN,
    fetch: (request: RequestWithCacheOptions) =>
      fetch(request, { next: request.next, signal: AbortSignal.timeout(TIMEOUT_MS) }),
  });
  return client;
}
