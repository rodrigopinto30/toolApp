export const ORDERS_PATH = "/account/orders";

export function orderPath(number: string): string {
  return `${ORDERS_PATH}/${encodeURIComponent(number)}`;
}
