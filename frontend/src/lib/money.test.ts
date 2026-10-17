import { formatMoney } from "./money";

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
