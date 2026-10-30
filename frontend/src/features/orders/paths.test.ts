import { isOrderNumber, orderPath } from "./paths";

it.each([
  ["TA-2026-000001", true],
  ["TA-2026-1234567", true],
  ["TA-2026-12345", false],
  ["ta-2026-000001", false],
  ["../../etc/passwd", false],
])("checks the order number %s", (number, valid) => {
  expect(isOrderNumber(number)).toBe(valid);
});

it("builds the order path", () => {
  expect(orderPath("TA-2026-000001")).toBe("/account/orders/TA-2026-000001");
});
