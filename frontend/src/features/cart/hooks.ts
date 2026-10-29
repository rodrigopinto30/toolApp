"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { useEffect } from "react";

import { useSession } from "@/features/session/session-provider";
import type { Locale } from "@/i18n/locales";
import { api } from "@/lib/api/browser";
import { ApiError, unwrap } from "@/lib/api/errors";
import type { Currency } from "@/lib/currency";
import { useCurrency } from "@/lib/currency-context";
import { MAX_LINE_QUANTITY, type GuestItem } from "@/stores/guest-cart";
import { useGuestCart, useGuestCartHydrated, useGuestCartStore } from "@/stores/store-provider";

import type { Cart, LineItem } from "./types";

export type CartChange = { variantId: number; quantity: number };

export const cartKeys = {
  all: ["cart"] as const,
  server: ["cart", "server"] as const,
  serverIn: (currency: Currency, locale: Locale) => ["cart", "server", currency, locale] as const,
  guest: (items: GuestItem[], currency: Currency, locale: Locale) =>
    ["cart", "guest", currency, locale, items] as const,
};

export function toLineItems(items: GuestItem[]): LineItem[] {
  return items.map(({ variantId, quantity }) => ({ variant_id: variantId, quantity }));
}

function useCartContext() {
  const currency = useCurrency();
  const locale = useLocale() as Locale;
  return { currency, locale, query: { currency, locale } };
}

function serverCartQuery(currency: Currency, locale: Locale) {
  return {
    queryKey: cartKeys.serverIn(currency, locale),
    queryFn: () => unwrap(api.GET("/api/v1/me/cart", { params: { query: { currency, locale } } })),
  };
}

function useServerCart() {
  const { hasSession } = useSession();
  const { currency, locale } = useCartContext();
  return useQuery({ ...serverCartQuery(currency, locale), enabled: hasSession });
}

export type CartState = {
  isGuest: boolean;
  cart: Cart | undefined;
  isEmpty: boolean;
  isLoading: boolean;
  isUpdating: boolean;
  error: unknown;
};

export function useCart(): CartState {
  const { hasSession } = useSession();
  const { currency, locale } = useCartContext();
  const hydrated = useGuestCartHydrated();
  const items = useGuestCart((state) => state.items);
  const retain = useGuestCart((state) => state.retain);
  const server = useServerCart();
  const guest = useQuery({
    queryKey: cartKeys.guest(items, currency, locale),
    queryFn: () =>
      unwrap(
        api.POST("/api/v1/cart/quote", {
          params: { query: { currency, locale } },
          body: { items: toLineItems(items) },
        }),
      ),
    enabled: !hasSession && hydrated && items.length > 0,
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (guest.data && !guest.isPlaceholderData) {
      retain(guest.data.items.map((line) => line.variant_id));
    }
  }, [guest.data, guest.isPlaceholderData, retain]);

  if (hasSession) {
    return {
      isGuest: false,
      cart: server.data,
      isEmpty: server.data?.items.length === 0,
      isLoading: server.isPending,
      isUpdating: server.isFetching,
      error: server.error,
    };
  }
  const isEmpty = hydrated && items.length === 0;
  return {
    isGuest: true,
    cart: isEmpty ? undefined : guest.data,
    isEmpty,
    isLoading: !hydrated || (!isEmpty && guest.isPending),
    isUpdating: guest.isFetching,
    error: isEmpty ? null : guest.error,
  };
}

export function useCartCount(): number | undefined {
  const { hasSession } = useSession();
  const hydrated = useGuestCartHydrated();
  const guestCount = useGuestCart((state) => state.items.reduce((sum, item) => sum + item.quantity, 0));
  const server = useServerCart();
  if (hasSession) {
    return server.data?.item_count;
  }
  return hydrated ? guestCount : undefined;
}

function cartLimitError(): ApiError {
  return new ApiError({ status: 422, code: "cart_limit", message: "The cart is full." });
}

function useCartWriter() {
  const { hasSession } = useSession();
  const store = useGuestCartStore();
  const queryClient = useQueryClient();
  const { currency, locale, query } = useCartContext();

  const write = async ({ variantId, quantity }: CartChange): Promise<void> => {
    if (!hasSession) {
      if (quantity === 0) {
        store.getState().remove(variantId);
      } else if (!store.getState().setQuantity(variantId, quantity)) {
        throw cartLimitError();
      }
      return;
    }
    const path = { variant_id: variantId };
    if (quantity === 0) {
      await unwrap(api.DELETE("/api/v1/me/cart/items/{variant_id}", { params: { path } }));
      await queryClient.invalidateQueries({ queryKey: cartKeys.server });
      return;
    }
    const cart = await unwrap(
      api.PUT("/api/v1/me/cart/items/{variant_id}", { params: { path, query }, body: { quantity } }),
    );
    await queryClient.invalidateQueries({ queryKey: cartKeys.server, refetchType: "none" });
    queryClient.setQueryData(cartKeys.serverIn(currency, locale), cart);
  };

  const currentQuantity = async (variantId: number): Promise<number> => {
    if (!hasSession) {
      return store.getState().items.find((item) => item.variantId === variantId)?.quantity ?? 0;
    }
    const cart = await queryClient.ensureQueryData(serverCartQuery(currency, locale));
    return cart.items.find((line) => line.variant_id === variantId)?.quantity ?? 0;
  };

  return { write, currentQuantity };
}

export function useUpdateCartLine() {
  const { write } = useCartWriter();
  return useMutation({ mutationFn: write });
}

export function useAddToCart() {
  const { write, currentQuantity } = useCartWriter();
  return useMutation({
    mutationFn: async ({ variantId, quantity }: CartChange) => {
      const current = await currentQuantity(variantId);
      await write({ variantId, quantity: Math.min(current + quantity, MAX_LINE_QUANTITY) });
    },
  });
}

export function useMergeGuestCart() {
  const store = useGuestCartStore();
  const queryClient = useQueryClient();
  const { currency, locale, query } = useCartContext();
  return useMutation({
    mutationFn: async () => {
      const { items } = store.getState();
      if (items.length === 0) {
        return null;
      }
      const merged = await unwrap(
        api.POST("/api/v1/me/cart/merge", { params: { query }, body: { items: toLineItems(items) } }),
      );
      queryClient.setQueryData(cartKeys.serverIn(currency, locale), merged.cart);
      store.getState().clear();
      store.getState().setAdjustments(merged.adjustments);
      return merged;
    },
  });
}
