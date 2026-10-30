const ORDER_NUMBER = /^TA-\d{4}-\d{6,}$/;

export const ORDERS_PATH = "/account/orders";

export function orderPath(number: string): string {
  return `${ORDERS_PATH}/${encodeURIComponent(number)}`;
}

export function isOrderNumber(value: string): boolean {
  return ORDER_NUMBER.test(value);
}
