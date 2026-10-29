import { chooseVariant, defaultVariant, variantBySku, variantOptions, type Variant } from "./variants";

let nextId = 0;

function variant(sku: string, attributes: Record<string, string>, stock: Variant["stock_status"] = "in_stock"): Variant {
  nextId += 1;
  return {
    id: nextId,
    sku,
    price: { amount: "100", currency: "USD" },
    compare_at: null,
    stock_status: stock,
    attributes: Object.entries(attributes).map(([code, value]) => ({
      code,
      name: code === "size" ? "Medida" : "Color",
      value_slug: value,
      value: value.toUpperCase(),
    })),
  };
}

const SMALL_RED = variant("S-RED", { size: "s", color: "red" }, "out_of_stock");
const SMALL_BLUE = variant("S-BLUE", { size: "s", color: "blue" });
const LARGE_RED = variant("L-RED", { size: "l", color: "red" });
const VARIANTS = [SMALL_RED, SMALL_BLUE, LARGE_RED];

it("lists every attribute with its values in order of appearance", () => {
  expect(variantOptions(VARIANTS)).toEqual([
    { code: "size", name: "Medida", values: [{ slug: "s", label: "S" }, { slug: "l", label: "L" }] },
    { code: "color", name: "Color", values: [{ slug: "red", label: "RED" }, { slug: "blue", label: "BLUE" }] },
  ]);
});

it("starts from the first variant in stock and finds a variant by SKU", () => {
  expect(defaultVariant(VARIANTS)).toBe(SMALL_BLUE);
  expect(defaultVariant([SMALL_RED])).toBe(SMALL_RED);
  expect(variantBySku(VARIANTS, "L-RED")).toBe(LARGE_RED);
  expect(variantBySku(VARIANTS, "NOPE")).toBe(SMALL_BLUE);
  expect(variantBySku(VARIANTS, null)).toBe(SMALL_BLUE);
});

it("keeps the other choices when they exist and never ends in an impossible combination", () => {
  expect(chooseVariant(VARIANTS, SMALL_BLUE, "color", "red")).toBe(SMALL_RED);
  expect(chooseVariant(VARIANTS, SMALL_RED, "size", "l")).toBe(LARGE_RED);
  expect(chooseVariant(VARIANTS, LARGE_RED, "color", "blue")).toBe(SMALL_BLUE);
  expect(chooseVariant(VARIANTS, LARGE_RED, "color", "green")).toBe(LARGE_RED);
});
