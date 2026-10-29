"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { useStore } from "zustand";

import { createGuestCartStore, GUEST_CART_KEY, type GuestCartState, type GuestCartStore } from "./guest-cart";

const GuestCartContext = createContext<GuestCartStore | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [guestCart] = useState(createGuestCartStore);

  useEffect(() => {
    void guestCart.persist.rehydrate();
    const onStorage = (event: StorageEvent) => {
      if (event.key === GUEST_CART_KEY) {
        void guestCart.persist.rehydrate();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [guestCart]);

  return <GuestCartContext value={guestCart}>{children}</GuestCartContext>;
}

export function useGuestCartStore(): GuestCartStore {
  const store = useContext(GuestCartContext);
  if (!store) {
    throw new Error("useGuestCartStore must be used inside StoreProvider");
  }
  return store;
}

export function useGuestCart<T>(selector: (state: GuestCartState) => T): T {
  return useStore(useGuestCartStore(), selector);
}

export function useGuestCartHydrated(): boolean {
  const store = useGuestCartStore();
  return useSyncExternalStore(
    (onChange) => store.persist.onFinishHydration(onChange),
    () => store.persist.hasHydrated(),
    () => false,
  );
}
