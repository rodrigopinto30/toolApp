"use client";

import { createContext, useContext } from "react";

import { DEFAULT_CURRENCY, type Currency } from "./currency";

const CurrencyContext = createContext<Currency>(DEFAULT_CURRENCY);

export function CurrencyProvider({ currency, children }: { currency: Currency; children: React.ReactNode }) {
  return <CurrencyContext value={currency}>{children}</CurrencyContext>;
}

export function useCurrency(): Currency {
  return useContext(CurrencyContext);
}
