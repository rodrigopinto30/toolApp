"use client";

import { keepPreviousData, queryOptions, skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import type { Locale } from "@/i18n/locales";
import { api } from "@/lib/api/browser";
import { ApiError, unwrap } from "@/lib/api/errors";

import type { CardPayment, CheckoutBody, CheckoutPreviewRequest } from "./types";

export const checkoutKeys = {
  preview: (body: CheckoutPreviewRequest | null, locale: Locale) => ["checkout", "preview", locale, body] as const,
};

export function checkoutPreviewQuery(body: CheckoutPreviewRequest | null, locale: Locale) {
  return queryOptions({
    queryKey: checkoutKeys.preview(body, locale),
    queryFn: body
      ? () => unwrap(api.POST("/api/v1/checkout/preview", { params: { query: { locale } }, body }))
      : skipToken,
  });
}

export function useCheckoutPreview(body: CheckoutPreviewRequest | null) {
  const locale = useLocale() as Locale;
  return useQuery({ ...checkoutPreviewQuery(body, locale), placeholderData: keepPreviousData });
}

export function useApplyCoupon() {
  const queryClient = useQueryClient();
  const locale = useLocale() as Locale;
  return useMutation({
    mutationFn: (body: CheckoutPreviewRequest) => queryClient.fetchQuery(checkoutPreviewQuery(body, locale)),
  });
}

export type PlaceOrderVariables = { body: CheckoutBody; key: string };

export function usePlaceOrder(readCard: () => CardPayment) {
  const locale = useLocale() as Locale;
  return useMutation({
    mutationFn: async ({ body, key }: PlaceOrderVariables) => {
      const { data, error, response } = await api.POST("/api/v1/checkout", {
        params: { query: { locale }, header: { "Idempotency-Key": key } },
        body: { ...body, payment: readCard() },
      });
      if (!response.ok || !data) {
        throw ApiError.fromResponse(response, error);
      }
      return { order: data, pending: response.status === 202 };
    },
  });
}
