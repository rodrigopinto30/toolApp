import { currencyCookie, parseCurrency } from "./currency";

it("accepts only the supported currencies", () => {
  expect(parseCurrency("USD")).toBe("USD");
  expect(parseCurrency("ARS")).toBe("ARS");
  expect(parseCurrency("usd")).toBe("ARS");
  expect(parseCurrency("EUR")).toBe("ARS");
  expect(parseCurrency(undefined)).toBe("ARS");
});

it("stores the choice for a year, same-site and over HTTPS only", () => {
  expect(currencyCookie("USD")).toBe("currency=USD; Path=/; Max-Age=31536000; SameSite=Lax; Secure");
});
