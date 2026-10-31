import { formatDecimal, formatMoney } from "./money";

function format(amount: string, currency: "ARS" | "USD", locale: "es" | "en"): string {
  return formatMoney({ amount, currency }, locale).replace(/\s/g, " ");
}

it("formats pesos without decimals and dollars with two", () => {
  expect(format("86855", "ARS", "es")).toBe("$ 86.855");
  expect(format("189.00", "USD", "es")).toBe("US$ 189,00");
  expect(format("86855", "ARS", "en")).toBe("ARS 86,855");
  expect(format("189.00", "USD", "en")).toBe("$189.00");
});

it("keeps the exact decimal value of large amounts", () => {
  expect(format("12345678901234.56", "USD", "en")).toBe("$12,345,678,901,234.56");
});

it("formats a decimal without rounding it through a float", () => {
  expect(formatDecimal("1450.500000", "es", 6)).toBe("1.450,5");
  expect(formatDecimal("1234567890123.123456", "en", 6)).toBe("1,234,567,890,123.123456");
});
