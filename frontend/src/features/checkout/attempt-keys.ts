import { ApiError } from "@/lib/api/errors";

const RETRY_SAFE_CODES = new Set(["network_error", "timeout", "rate_limited", "service_unavailable"]);

export function createAttemptKeys(generate: () => string = () => crypto.randomUUID()) {
  let current: { key: string; fingerprint: string } | null = null;
  return {
    keyFor(fingerprint: string): string {
      if (!current || current.fingerprint !== fingerprint) {
        current = { key: generate(), fingerprint };
      }
      return current.key;
    },
    settle(): void {
      current = null;
    },
  };
}

export type AttemptKeys = ReturnType<typeof createAttemptKeys>;

export function keepsAttempt(error: unknown): boolean {
  return error instanceof ApiError && (RETRY_SAFE_CODES.has(error.code) || error.status >= 500);
}
