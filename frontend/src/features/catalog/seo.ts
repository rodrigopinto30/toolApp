import { DEFAULT_LOCALE, LOCALES, type Locale } from "@/i18n/locales";

export function localizedUrl(origin: string, locale: Locale, path: string): string {
  return `${origin}/${locale}${path === "/" ? "" : path}`;
}

export type LocalizedAlternates = { canonical: string; languages: Record<string, string> };

export function localizedAlternates(path: string, locale: Locale, page = 1): LocalizedAlternates {
  const query = page > 1 ? `?page=${page}` : "";
  const href = (target: Locale) => `/${target}${path}${query}`;
  return {
    canonical: href(locale),
    languages: {
      ...Object.fromEntries(LOCALES.map((target) => [target, href(target)])),
      "x-default": href(DEFAULT_LOCALE),
    },
  };
}
