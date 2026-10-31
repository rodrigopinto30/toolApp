import { couponSchema, exchangeRateSchema, pickupPointSchema, zoneSchema } from "./schemas";

const t = (key: string) => key;

function issues(schema: { safeParse: (value: unknown) => { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } } }, values: object) {
  const result = schema.safeParse(values);
  return result.error?.issues.map((issue) => [issue.path.join("."), issue.message]) ?? [];
}

const COUPON = {
  code: "VERANO",
  type: "percent",
  value: "10",
  min_subtotal_usd: "",
  starts_at: "2026-11-01T10:00",
  ends_at: "",
  max_uses: "",
  max_uses_per_user: "",
  is_active: true,
};
const ZONE = {
  code: "patagonia",
  name: { es: "Patagonia", en: "Patagonia" },
  cost_usd: "12.50",
  free_over_usd: "",
  eta_min_days: "3",
  eta_max_days: "7",
  is_active: true,
};

describe("exchange rate", () => {
  const schema = exchangeRateSchema(t);

  it("accepts a comma and up to 6 decimals", () => {
    expect(schema.parse({ rate: "1450,123456" }).rate).toBe("1450.123456");
  });

  it.each(["", "0", "-5", "1.1234567", "abc"])("rejects %j", (rate) => {
    expect(issues(schema, { rate })).toEqual([["rate", "rate"]]);
  });
});

describe("coupon", () => {
  const schema = couponSchema(t);

  it("turns empty optional fields into null and the dates into UTC", () => {
    const coupon = schema.parse({ ...COUPON, value: "10,5" });

    expect(coupon).toMatchObject({ value: "10.5", min_subtotal_usd: null, ends_at: null, max_uses: null });
    expect(coupon.starts_at).toMatch(/Z$/);
  });

  it("keeps a percentage at 100 or below, but not a fixed amount", () => {
    expect(issues(schema, { ...COUPON, value: "100" })).toEqual([]);
    expect(issues(schema, { ...COUPON, value: "100.01" })).toEqual([["value", "percent"]]);
    expect(issues(schema, { ...COUPON, type: "fixed", value: "100.01" })).toEqual([]);
  });

  it("needs the end after the start", () => {
    expect(issues(schema, { ...COUPON, ends_at: COUPON.starts_at })).toEqual([["ends_at", "period"]]);
    expect(issues(schema, { ...COUPON, ends_at: "2026-11-01T10:01" })).toEqual([]);
  });

  it.each([
    ["code", "AB", "code"],
    ["code", "CON ESPACIO", "code"],
    ["value", "0", "amount"],
    ["min_subtotal_usd", "1.123", "amount"],
    ["max_uses", "0", "wholeNumber"],
    ["max_uses_per_user", "1.5", "wholeNumber"],
    ["starts_at", "", "required"],
  ])("rejects %s = %j", (field, value, message) => {
    expect(issues(schema, { ...COUPON, [field]: value })).toEqual([[field, message]]);
  });
});

describe("zone", () => {
  const schema = zoneSchema(t);

  it("turns the days into numbers and an empty threshold into null", () => {
    expect(schema.parse({ ...ZONE, cost_usd: "0" })).toMatchObject({
      cost_usd: "0",
      free_over_usd: null,
      eta_min_days: 3,
      eta_max_days: 7,
    });
  });

  it("needs a name in both languages", () => {
    expect(issues(schema, { ...ZONE, name: { es: "Patagonia", en: " " } })).toEqual([["name.en", "required"]]);
  });

  it("keeps the delivery range in order", () => {
    expect(issues(schema, { ...ZONE, eta_min_days: "8" })).toEqual([["eta_max_days", "etaRange"]]);
    expect(issues(schema, { ...ZONE, eta_min_days: "7" })).toEqual([]);
  });

  it("rejects a free shipping threshold of zero", () => {
    expect(issues(schema, { ...ZONE, free_over_usd: "0" })).toEqual([["free_over_usd", "amount"]]);
  });
});

it("limits the hours of a pickup point", () => {
  const hours = { mon_fri: "9 a 18", sat: "", sun: "a".repeat(81) };

  expect(issues(pickupPointSchema(t), { name: "Local", address: "Calle 1", hours, is_active: true })).toEqual([
    ["hours.sun", "tooLong"],
  ]);
});
