import { expect, type APIRequestContext } from "@playwright/test";

import type { Cart, CartLine, LineItem } from "../../src/features/cart/types";
import type { Currency } from "../../src/lib/currency";
import { csrfHeaders } from "./api";
import { productDetail, searchProducts } from "./catalog";

const MAX_QUANTITY = 99;

export async function quoteCart(request: APIRequestContext, items: LineItem[], currency: Currency = "ARS"): Promise<Cart> {
  const response = await request.post(`/api/v1/cart/quote?currency=${currency}&locale=es`, {
    headers: await csrfHeaders(request),
    data: { items },
  });
  expect(response.status(), "cart quote").toBe(200);
  return response.json();
}

export async function serverCart(request: APIRequestContext): Promise<Cart> {
  const response = await request.get("/api/v1/me/cart?currency=ARS&locale=es");
  expect(response.status(), "customer cart").toBe(200);
  return response.json();
}

export async function emptyServerCart(request: APIRequestContext): Promise<void> {
  const headers = await csrfHeaders(request);
  for (const line of (await serverCart(request)).items) {
    const response = await request.delete(`/api/v1/me/cart/items/${line.variant_id}`, { headers });
    expect(response.status(), "remove a cart line").toBe(204);
  }
}

export async function setServerLine(request: APIRequestContext, variantId: number, quantity: number): Promise<void> {
  const response = await request.put(`/api/v1/me/cart/items/${variantId}?currency=ARS&locale=es`, {
    headers: await csrfHeaders(request),
    data: { quantity },
  });
  expect(response.status(), "set a cart line").toBe(200);
}

export async function fillServerCart(request: APIRequestContext, units = 1): Promise<CartLine> {
  const { plenty } = await cartVariants(request);
  await setServerLine(request, plenty.variant_id, units);
  return plenty;
}

export type CartVariants = { plenty: CartLine; limited: CartLine };

export async function cartVariants(request: APIRequestContext): Promise<CartVariants> {
  const { items } = await searchProducts(request, { size: "48" });
  const details = await Promise.all(items.map((item) => productDetail(request, item.slug)));
  const lineItems = details
    .flatMap((product) => product.variants)
    .filter((variant) => variant.stock_status !== "out_of_stock")
    .slice(0, 50)
    .map((variant) => ({ variant_id: variant.id, quantity: MAX_QUANTITY }));
  const { items: lines } = await quoteCart(request, lineItems);
  const plenty = lines.find((line) => line.issue === null);
  const limited = lines.find((line) => line.issue === "insufficient_stock" && (line.available ?? 0) > 1);
  if (!plenty || !limited) {
    throw new Error("The seed needs a variant with 99 or more units and one with fewer");
  }
  return { plenty, limited };
}
