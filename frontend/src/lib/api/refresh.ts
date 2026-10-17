import { apiUrl, send } from "./transport";

export type RefreshOutcome = "refreshed" | "expired" | "failed";

const LOCK_NAME = "toolapp-auth-refresh";
const REFRESHED_AT_KEY = "toolapp:auth:refreshed-at";
const RECENT_REFRESH_MS = 10_000;
const IN_PROGRESS_WAIT_MS = 500;
const REFRESH_TIMEOUT_MS = 15_000;

let inFlight: Promise<RefreshOutcome> | null = null;
let sessionHint: () => boolean = () => false;
const expiredListeners = new Set<() => void>();

export function setSessionHint(hint: () => boolean): void {
  sessionHint = hint;
}

export function believesLoggedIn(): boolean {
  return sessionHint();
}

export function onSessionExpired(listener: () => void): () => void {
  expiredListeners.add(listener);
  return () => {
    expiredListeners.delete(listener);
  };
}

export function refreshSession(): Promise<RefreshOutcome> {
  inFlight ??= withLock(runRefresh).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function withLock(task: () => Promise<RefreshOutcome>): Promise<RefreshOutcome> {
  const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
  return locks ? await locks.request(LOCK_NAME, task) : task();
}

async function runRefresh(): Promise<RefreshOutcome> {
  if (Date.now() - readRefreshedAt() < RECENT_REFRESH_MS) {
    return "refreshed";
  }
  let response: Response;
  try {
    response = await send(new Request(apiUrl("/api/v1/auth/refresh"), { method: "POST" }), REFRESH_TIMEOUT_MS);
  } catch {
    return "failed";
  }
  if (response.ok) {
    writeRefreshedAt(Date.now());
    return "refreshed";
  }
  if (response.status === 409) {
    await new Promise((resolve) => setTimeout(resolve, IN_PROGRESS_WAIT_MS));
    return "refreshed";
  }
  if (response.status === 401) {
    expiredListeners.forEach((listener) => listener());
    return "expired";
  }
  return "failed";
}

function readRefreshedAt(): number {
  try {
    return Number(localStorage.getItem(REFRESHED_AT_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeRefreshedAt(timestamp: number): void {
  try {
    localStorage.setItem(REFRESHED_AT_KEY, String(timestamp));
  } catch {
    return;
  }
}
