import { hasLocale } from "next-intl";

import { routing, type Locale } from "@/i18n/routing";
import { AUTH_PATHS } from "@/lib/routes";

const PROBE_ORIGIN = "https://toolapp.invalid";

export function safeRedirect(target: string | undefined, locale: Locale): string {
  const fallback = `/${locale}/account`;
  if (!target || !target.startsWith("/") || target.startsWith("//") || target.includes("\\")) {
    return fallback;
  }
  let url: URL;
  try {
    url = new URL(target, PROBE_ORIGIN);
  } catch {
    return fallback;
  }
  if (url.origin !== PROBE_ORIGIN) {
    return fallback;
  }
  const [, first, ...rest] = url.pathname.split("/");
  const path = `/${rest.join("/")}`;
  if (!hasLocale(routing.locales, first) || AUTH_PATHS.some((prefix) => path.startsWith(prefix))) {
    return fallback;
  }
  return `${url.pathname}${url.search}`;
}
