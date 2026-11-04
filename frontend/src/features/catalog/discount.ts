import type { Money } from "@/lib/money";

export function discountPercent(price: Money, compareAt: Money | null | undefined): number | null {
  if (!compareAt) {
    return null;
  }
  const now = Number(price.amount);
  const before = Number(compareAt.amount);
  if (!(before > now) || now <= 0) {
    return null;
  }
  const percent = Math.round((1 - now / before) * 100);
  return percent >= 1 ? percent : null;
}
