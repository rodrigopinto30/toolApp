import { createJSONStorage, persist } from "zustand/middleware";
import { createStore } from "zustand/vanilla";

import type { components } from "@/lib/api/schema";
import { z } from "@/lib/zod";

export const GUEST_CART_KEY = "toolapp-cart";
export const MAX_CART_LINES = 50;
export const MAX_LINE_QUANTITY = 99;

export type GuestItem = { variantId: number; quantity: number };
export type CartAdjustment = components["schemas"]["CartAdjustment"];

export type GuestCartState = {
  items: GuestItem[];
  adjustments: CartAdjustment[];
  setQuantity: (variantId: number, quantity: number) => boolean;
  remove: (variantId: number) => void;
  retain: (variantIds: number[]) => void;
  clear: () => void;
  setAdjustments: (adjustments: CartAdjustment[]) => void;
};

const storedCartSchema = z.object({
  items: z
    .array(
      z.object({
        variantId: z.number().int().positive(),
        quantity: z.number().int().min(1).max(MAX_LINE_QUANTITY),
      }),
    )
    .max(MAX_CART_LINES)
    .refine((items) => new Set(items.map((item) => item.variantId)).size === items.length),
});

export function parseStoredItems(value: unknown): GuestItem[] {
  const parsed = storedCartSchema.safeParse(value);
  return parsed.success ? parsed.data.items : [];
}

function clampQuantity(quantity: number): number {
  return Math.min(Math.max(Math.trunc(quantity), 1), MAX_LINE_QUANTITY);
}

export function createGuestCartStore() {
  return createStore<GuestCartState>()(
    persist(
      (set, get) => ({
        items: [],
        adjustments: [],
        setQuantity: (variantId, quantity) => {
          const { items } = get();
          const line = { variantId, quantity: clampQuantity(quantity) };
          if (items.some((item) => item.variantId === variantId)) {
            set({ items: items.map((item) => (item.variantId === variantId ? line : item)) });
            return true;
          }
          if (items.length >= MAX_CART_LINES) {
            return false;
          }
          set({ items: [...items, line] });
          return true;
        },
        remove: (variantId) => set({ items: get().items.filter((item) => item.variantId !== variantId) }),
        retain: (variantIds) => {
          const known = new Set(variantIds);
          const { items } = get();
          if (items.some((item) => !known.has(item.variantId))) {
            set({ items: items.filter((item) => known.has(item.variantId)) });
          }
        },
        clear: () => set({ items: [] }),
        setAdjustments: (adjustments) => set({ adjustments }),
      }),
      {
        name: GUEST_CART_KEY,
        version: 1,
        storage: createJSONStorage(() => localStorage),
        partialize: (state) => ({ items: state.items }),
        migrate: () => ({ items: [] }),
        merge: (persisted, current) => ({ ...current, items: parseStoredItems(persisted) }),
        skipHydration: true,
      },
    ),
  );
}

export type GuestCartStore = ReturnType<typeof createGuestCartStore>;
