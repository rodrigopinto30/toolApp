"use client";

import { useMutation } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { api } from "@/lib/api/browser";
import { unwrap } from "@/lib/api/errors";

import type { ShippingQuoteRequest } from "./types";

export function useShippingQuote() {
  const locale = useLocale();
  return useMutation({
    mutationFn: (body: ShippingQuoteRequest) =>
      unwrap(api.POST("/api/v1/shipping/quote", { params: { query: { locale } }, body })),
  });
}
