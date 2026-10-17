"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function tokenFromHash(): string {
  return new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
}

export function useFragmentToken(): string | null {
  return useSyncExternalStore(subscribe, tokenFromHash, () => null);
}

export function clearFragment(): void {
  window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);
}
