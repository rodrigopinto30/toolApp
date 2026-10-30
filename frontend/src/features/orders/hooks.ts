"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { cartKeys } from "@/features/cart/hooks";
import { failureOf } from "@/features/checkout/outcome";
import type { CardPayment } from "@/features/checkout/types";
import { useSession } from "@/features/session/session-provider";
import type { Locale } from "@/i18n/locales";
import { api } from "@/lib/api/browser";
import { ApiError, unwrap } from "@/lib/api/errors";

import type { Order } from "./types";

const PAGE_SIZE = 10;

export const orderKeys = {
  all: ["orders"] as const,
  list: (page: number) => ["orders", "list", page] as const,
  detail: (number: string, locale: Locale) => ["orders", "detail", number, locale] as const,
};

export function useOrders(page: number) {
  const { hasSession } = useSession();
  return useQuery({
    queryKey: orderKeys.list(page),
    queryFn: () => unwrap(api.GET("/api/v1/me/orders", { params: { query: { page, size: PAGE_SIZE } } })),
    enabled: hasSession,
  });
}

export function useOrder(number: string) {
  const { hasSession } = useSession();
  const locale = useLocale() as Locale;
  return useQuery({
    queryKey: orderKeys.detail(number, locale),
    queryFn: () =>
      unwrap(api.GET("/api/v1/me/orders/{number}", { params: { path: { number }, query: { locale } } })),
    enabled: hasSession,
  });
}

function useOrderUpdates(number: string) {
  const queryClient = useQueryClient();
  const locale = useLocale() as Locale;
  return {
    locale,
    store: async (order: Order) => {
      await queryClient.invalidateQueries({ queryKey: orderKeys.all, refetchType: "none" });
      queryClient.setQueryData(orderKeys.detail(number, locale), order);
    },
    refetch: () => queryClient.invalidateQueries({ queryKey: orderKeys.all }),
    refreshCart: () => queryClient.invalidateQueries({ queryKey: cartKeys.all }),
  };
}

export function useCancelOrder(number: string) {
  const { locale, store, refetch } = useOrderUpdates(number);
  return useMutation({
    mutationFn: () =>
      unwrap(api.POST("/api/v1/me/orders/{number}/cancel", { params: { path: { number }, query: { locale } } })),
    onSuccess: store,
    onError: (error) => {
      if (error instanceof ApiError && error.code === "invalid_transition") {
        return refetch();
      }
      return undefined;
    },
  });
}

export type PayOrderHandlers = { onPaid: () => void; onRejected: () => void };

export function usePayOrder(number: string, readCard: () => CardPayment, handlers: PayOrderHandlers) {
  const { locale, store, refetch, refreshCart } = useOrderUpdates(number);
  return useMutation({
    mutationFn: async (key: string) => {
      const { data, error, response } = await api.POST("/api/v1/me/orders/{number}/pay", {
        params: { path: { number }, query: { locale }, header: { "Idempotency-Key": key } },
        body: { payment: readCard() },
      });
      if (!response.ok || !data) {
        throw ApiError.fromResponse(response, error);
      }
      return { order: data, pending: response.status === 202 };
    },
    onSuccess: ({ order, pending }) => {
      if (!pending) {
        handlers.onPaid();
      }
      return store(order);
    },
    onError: async (error) => {
      if (failureOf(error).kind === "rejected") {
        handlers.onRejected();
      }
      if (error instanceof ApiError && ["payment_rejected", "invalid_transition"].includes(error.code)) {
        await Promise.all([refetch(), refreshCart()]);
      }
    },
  });
}
