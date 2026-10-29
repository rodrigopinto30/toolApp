import type { Cart, CartLine } from "@/features/cart/types";
import { GUEST_CART_KEY, type GuestItem } from "@/stores/guest-cart";

export const ORIGIN = "https://localhost";

export function cartLine(overrides: Partial<CartLine> = {}): CartLine {
  return {
    variant_id: 30,
    sku: "TRU-WP-6",
    product_slug: "truper-nylon-wall-plugs-100",
    product_name: "Tarugos de nylon (100 u.)",
    variant_label: "6 mm",
    image: null,
    quantity: 2,
    unit_price: { amount: "5075", currency: "ARS" },
    line_total: { amount: "10150", currency: "ARS" },
    stock_status: "in_stock",
    issue: null,
    available: null,
    ...overrides,
  };
}

export function cartOf(items: CartLine[], subtotal = "10150"): Cart {
  return {
    items,
    item_count: items.reduce((sum, line) => sum + line.quantity, 0),
    subtotal: { amount: subtotal, currency: "ARS" },
    has_issues: items.some((line) => line.issue !== null),
    currency: "ARS",
  };
}

export function storeGuestCart(items: GuestItem[]): void {
  localStorage.setItem(GUEST_CART_KEY, JSON.stringify({ state: { items }, version: 1 }));
}

export function storedGuestItems(): GuestItem[] {
  const stored = localStorage.getItem(GUEST_CART_KEY);
  return stored ? (JSON.parse(stored) as { state: { items: GuestItem[] } }).state.items : [];
}
