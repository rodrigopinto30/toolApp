export const CURRENCIES = ["ARS", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const DEFAULT_CURRENCY: Currency = "ARS";
export const CURRENCY_COOKIE = "currency";
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

export function parseCurrency(value: string | null | undefined): Currency {
  return CURRENCIES.find((currency) => currency === value) ?? DEFAULT_CURRENCY;
}

export function currencyCookie(currency: Currency): string {
  return `${CURRENCY_COOKIE}=${currency}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax; Secure`;
}

export function saveCurrency(currency: Currency): void {
  document.cookie = currencyCookie(currency);
}
