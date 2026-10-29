export const LOCALES = ["es", "en"] as const;
export const DEFAULT_LOCALE = "es";

export type Locale = (typeof LOCALES)[number];
