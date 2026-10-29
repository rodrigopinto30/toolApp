import { storeGuestCart } from "@/test/cart";

import { createGuestCartStore, GUEST_CART_KEY, MAX_CART_LINES, parseStoredItems } from "./guest-cart";

beforeEach(() => localStorage.clear());

it("sets absolute quantities between 1 and 99", () => {
  const store = createGuestCartStore();

  store.getState().setQuantity(30, 3);
  store.getState().setQuantity(30, 150);
  store.getState().setQuantity(11, 0);

  expect(store.getState().items).toEqual([
    { variantId: 30, quantity: 99 },
    { variantId: 11, quantity: 1 },
  ]);
});

it("refuses a new line beyond 50 but still updates existing ones", () => {
  const store = createGuestCartStore();
  for (let variantId = 1; variantId <= MAX_CART_LINES; variantId++) {
    store.getState().setQuantity(variantId, 1);
  }

  expect(store.getState().setQuantity(999, 1)).toBe(false);
  expect(store.getState().setQuantity(1, 5)).toBe(true);
  expect(store.getState().items).toHaveLength(MAX_CART_LINES);
});

it("removes lines and keeps only the variants the API knows", () => {
  const store = createGuestCartStore();
  [30, 11, 1].forEach((variantId) => store.getState().setQuantity(variantId, 1));

  store.getState().remove(11);
  store.getState().retain([30]);

  expect(store.getState().items).toEqual([{ variantId: 30, quantity: 1 }]);
});

it("persists only ids and quantities", async () => {
  const store = createGuestCartStore();
  await store.persist.rehydrate();

  store.getState().setQuantity(30, 2);
  store.getState().setAdjustments([{ variant_id: 1, requested: 2, applied: 0, reason: "unavailable" }]);

  expect(JSON.parse(localStorage.getItem(GUEST_CART_KEY) ?? "{}")).toEqual({
    state: { items: [{ variantId: 30, quantity: 2 }] },
    version: 1,
  });
});

it.each([
  ["a valid cart", { items: [{ variantId: 30, quantity: 2 }] }, [{ variantId: 30, quantity: 2 }]],
  ["a repeated variant", { items: [{ variantId: 30, quantity: 2 }, { variantId: 30, quantity: 1 }] }, []],
  ["a quantity over 99", { items: [{ variantId: 30, quantity: 100 }] }, []],
  ["a price snuck in", { items: [{ variantId: 30, quantity: 1, price: "1" }] }, [{ variantId: 30, quantity: 1 }]],
  ["garbage", "not a cart", []],
])("reads %s from storage safely", (_, value, expected) => {
  expect(parseStoredItems(value)).toEqual(expected);
});

it("drops a stored cart that does not validate when it rehydrates", async () => {
  storeGuestCart([{ variantId: -1, quantity: 2 }]);
  const store = createGuestCartStore();

  await store.persist.rehydrate();

  expect(store.getState().items).toEqual([]);
});

it("drops carts stored by an older version", async () => {
  localStorage.setItem(GUEST_CART_KEY, JSON.stringify({ state: { lines: [[30, 2]] }, version: 0 }));
  const store = createGuestCartStore();

  await store.persist.rehydrate();

  expect(store.getState().items).toEqual([]);
});
