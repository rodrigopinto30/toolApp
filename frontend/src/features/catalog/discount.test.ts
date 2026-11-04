import { discountPercent } from "./discount";

const ars = (amount: string) => ({ amount, currency: "ARS" as const });

it("rounds the discount to a whole percent", () => {
  expect(discountPercent(ars("5075"), ars("6000"))).toBe(15);
  expect(discountPercent({ amount: "189.00", currency: "USD" }, { amount: "219.00", currency: "USD" })).toBe(14);
});

it("has no discount without a higher previous price or below one percent", () => {
  expect(discountPercent(ars("5075"), null)).toBeNull();
  expect(discountPercent(ars("6000"), ars("6000"))).toBeNull();
  expect(discountPercent(ars("6500"), ars("6000"))).toBeNull();
  expect(discountPercent(ars("9990"), ars("10000"))).toBeNull();
});
