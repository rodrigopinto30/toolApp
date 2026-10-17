import "server-only";

import { cookies } from "next/headers";

import { CURRENCY_COOKIE, parseCurrency, type Currency } from "./currency";

export async function getCurrency(): Promise<Currency> {
  return parseCurrency((await cookies()).get(CURRENCY_COOKIE)?.value);
}
