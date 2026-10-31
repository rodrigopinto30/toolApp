import { expect, type APIRequestContext } from "@playwright/test";

import { csrfHeaders } from "./api";

type PendingReview = { id: number; title: string };

const PICKUP_STEPS = ["preparing", "ready_for_pickup", "delivered"];

export async function deliverPickupOrder(admin: APIRequestContext, number: string): Promise<void> {
  const headers = await csrfHeaders(admin);
  for (const status of PICKUP_STEPS) {
    const response = await admin.post(`/api/v1/admin/orders/${number}/status`, { headers, data: { status } });
    expect(response.status(), `order ${number} to ${status}`).toBe(200);
  }
}

export async function productStock(admin: APIRequestContext, name: string): Promise<number> {
  const response = await admin.get(`/api/v1/admin/products?${new URLSearchParams({ q: name, size: "100" })}`);
  expect(response.status(), "admin products").toBe(200);
  const items: { name: string; stock: number }[] = (await response.json()).items;
  const product = items.find((item) => item.name === name);
  if (!product) {
    throw new Error(`No product named ${name}`);
  }
  return product.stock;
}

export async function changeVariantPrice(
  admin: APIRequestContext,
  productId: number,
  sku: string,
  price: string,
): Promise<void> {
  const product = await admin.get(`/api/v1/admin/products/${productId}`);
  expect(product.status(), "product").toBe(200);
  const variants: { id: number; sku: string; version: number }[] = (await product.json()).variants;
  const variant = variants.find((item) => item.sku === sku);
  if (!variant) {
    throw new Error(`No variant with the SKU ${sku}`);
  }
  const response = await admin.patch(`/api/v1/admin/variants/${variant.id}`, {
    headers: await csrfHeaders(admin),
    data: { version: variant.version, price_usd: price },
  });
  expect(response.status(), "change the price").toBe(200);
}

export async function adminCoupon(admin: APIRequestContext, code: string): Promise<{ id: number }> {
  const response = await admin.get("/api/v1/admin/coupons?size=100");
  expect(response.status(), "coupons").toBe(200);
  const items: { id: number; code: string }[] = (await response.json()).items;
  const coupon = items.find((item) => item.code === code);
  if (!coupon) {
    throw new Error(`No coupon with the code ${code}`);
  }
  return coupon;
}

export async function approveReview(admin: APIRequestContext, title: string): Promise<void> {
  const list = await admin.get("/api/v1/admin/reviews?status=pending&size=100");
  expect(list.status(), "pending reviews").toBe(200);
  const items: PendingReview[] = (await list.json()).items;
  const review = items.find((item) => item.title === title);
  if (!review) {
    throw new Error(`No pending review titled ${title}`);
  }
  const response = await admin.post(`/api/v1/admin/reviews/${review.id}/approve`, {
    headers: await csrfHeaders(admin),
  });
  expect(response.status(), "approve the review").toBe(200);
}
