import { cardSchema } from "./schemas";
import { formatCardNumber, formatExpiry, isExpired, parseExpiry, validCardNumber } from "./card";

it.each([
  ["4242 4242 4242 4242", true],
  ["4000-0000-0000-0002", true],
  ["4000000000090003", true],
  ["378282246310005", true],
  ["4242 4242 4242 4241", false],
  ["424242424242", false],
  ["42424242424242424242", false],
])("checks the card number %s", (number, valid) => {
  expect(validCardNumber(number)).toBe(valid);
});

it("reads MM/YY and keeps the card valid through its month", () => {
  const now = new Date(Date.UTC(2026, 9, 29));

  expect(parseExpiry("10/26")).toEqual({ month: 10, year: 2026 });
  expect(parseExpiry("13/26")).toBeNull();
  expect(isExpired({ month: 10, year: 2026 }, now)).toBe(false);
  expect(isExpired({ month: 9, year: 2026 }, now)).toBe(true);
});

it("formats what the customer types", () => {
  expect(formatCardNumber("4242424242424242")).toBe("4242 4242 4242 4242");
  expect(formatCardNumber("4242-42x")).toBe("4242 42");
  expect(formatExpiry("1230")).toBe("12/30");
  expect(formatExpiry("1")).toBe("1");
});

it("validates the whole card like the backend", () => {
  const schema = cardSchema((key) => key, () => new Date(Date.UTC(2026, 9, 29)));
  const card = { card_number: "4242 4242 4242 4242", expiry: "12/30", cvc: "123", holder: "Ana Diaz" };

  expect(schema.safeParse(card).success).toBe(true);
  const result = schema.safeParse({ card_number: "4242", expiry: "01/26", cvc: "12", holder: " " });
  expect(result.error?.issues.map((issue) => [issue.path[0], issue.message])).toEqual([
    ["card_number", "cardNumber"],
    ["expiry", "cardExpired"],
    ["cvc", "cardCvc"],
    ["holder", "required"],
  ]);
});
