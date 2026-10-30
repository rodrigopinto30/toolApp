import type { Order } from "@/features/orders/types";

const money = (amount: string) => ({ amount, currency: "ARS" as const });

export function orderOf(overrides: Partial<Order> = {}): Order {
  return {
    number: "TA-2026-000001",
    status: "paid",
    currency: "ARS",
    exchange_rate: "1450.000000",
    items: [
      {
        variant_id: 30,
        sku: "TRU-WP-6",
        product_name: "Tarugos de nylon (100 u.)",
        variant_label: "6 mm",
        quantity: 2,
        unit_price: money("5075"),
        line_total: money("10150"),
      },
    ],
    subtotal: money("10150"),
    discount_total: money("0"),
    shipping_total: money("0"),
    total: money("10150"),
    coupon: null,
    delivery: {
      method: "pickup",
      address: null,
      zone: null,
      pickup_point: { id: 1, name: "ToolApp Store", address: "Av. Corrientes 1234", hours: null },
    },
    billing: null,
    status_history: [
      { from_status: null, to_status: "pending_payment", note: null, created_at: "2026-10-29T15:00:00Z" },
      { from_status: "pending_payment", to_status: "paid", note: null, created_at: "2026-10-29T15:00:05Z" },
    ],
    payments: [
      {
        status: "approved",
        amount: money("10150"),
        brand: "visa",
        last4: "4242",
        created_at: "2026-10-29T15:00:01Z",
      },
    ],
    created_at: "2026-10-29T15:00:00Z",
    paid_at: "2026-10-29T15:00:05Z",
    cancelled_at: null,
    ...overrides,
  };
}
