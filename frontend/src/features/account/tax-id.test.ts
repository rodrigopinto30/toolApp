import { billingProfileSchema } from "./schemas";
import { digitsOnly, isValidCuit, isValidDni } from "./tax-id";

it.each(["33693450239", "20123456786", "27333333339"])("accepts the CUIT %s", (cuit) => {
  expect(isValidCuit(cuit)).toBe(true);
});

it.each(["20123456785", "11123456786", "2012345678", "201234567860", "2012345678a"])(
  "rejects the CUIT %s",
  (cuit) => {
    expect(isValidCuit(cuit)).toBe(false);
  },
);

it("accepts DNIs of 7 or 8 digits and strips separators", () => {
  expect([isValidDni("1234567"), isValidDni("12345678"), isValidDni("123456")]).toEqual([true, true, false]);
  expect(digitsOnly("20-12345678-6")).toBe("20123456786");
  expect(digitsOnly("12.345.678")).toBe("12345678");
});

const schema = billingProfileSchema((key) => key);
const profile = {
  tax_id_type: "CUIT" as const,
  tax_id: "20-12345678-6",
  tax_condition: "monotributo" as const,
  legal_name: "Ana Diaz",
  fiscal_address: "Calle Falsa 123",
  is_default: false,
};

it("sends the tax id with digits only", () => {
  expect(schema.parse(profile).tax_id).toBe("20123456786");
});

it.each([
  [{ tax_id: "20-12345678-5" }, "tax_id", "cuit"],
  [{ tax_id: "" }, "tax_id", "required"],
  [{ tax_id_type: "DNI" as const, tax_id: "123456", tax_condition: "consumidor_final" as const }, "tax_id", "dni"],
  [{ tax_id_type: "DNI" as const, tax_id: "12.345.678" }, "tax_condition", "dniCondition"],
])("rejects %o with %s: %s", (overrides, path, message) => {
  const result = schema.safeParse({ ...profile, ...overrides });

  expect(result.success).toBe(false);
  expect(result.error?.issues).toContainEqual(expect.objectContaining({ path: [path], message }));
});
