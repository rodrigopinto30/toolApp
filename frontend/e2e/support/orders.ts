import { expect, type APIRequestContext } from "@playwright/test";

import type { Order } from "../../src/features/orders/types";
import { csrfHeaders } from "./api";

type OrderSummary = { number: string; status: string };

export async function customerOrders(request: APIRequestContext): Promise<OrderSummary[]> {
  const response = await request.get("/api/v1/me/orders?size=50");
  expect(response.status(), "customer orders").toBe(200);
  return (await response.json()).items;
}

export async function customerOrder(request: APIRequestContext, number: string): Promise<Order> {
  const response = await request.get(`/api/v1/me/orders/${number}?locale=es`);
  expect(response.status(), "order detail").toBe(200);
  return response.json();
}

export async function cancelOpenOrders(request: APIRequestContext): Promise<void> {
  const headers = await csrfHeaders(request);
  for (const order of await customerOrders(request)) {
    if (order.status === "paid" || order.status === "pending_payment") {
      const response = await request.post(`/api/v1/me/orders/${order.number}/cancel`, { headers });
      expect(response.status(), `cancel ${order.number}`).toBe(200);
    }
  }
}
