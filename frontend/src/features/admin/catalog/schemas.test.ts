import {
  attributeSchema,
  attributeValueSchema,
  brandSchema,
  categorySchema,
  imageSchema,
  NO_VALUE,
  productSchema,
  stockSchema,
  variantSchema,
} from "./schemas";

const t = (key: string) => key;

function issues(schema: { safeParse: (value: unknown) => { error?: { issues: { path: PropertyKey[]; message: string }[] } } }, values: object) {
  return schema.safeParse(values).error?.issues.map((issue) => [issue.path.join("."), issue.message]) ?? [];
}

const CATEGORY = {
  slug: "taladros",
  name: { es: "Taladros", en: "Drills" },
  description: { es: "", en: "" },
  parent_id: NO_VALUE,
  position: "0",
  is_active: true,
};
const TEXT = { name: "Taladro", short_description: "Corto", description: "Largo", specs: "" };
const PRODUCT = {
  slug: "taladro-18v",
  category_id: "3",
  brand_id: NO_VALUE,
  is_featured: false,
  translations: { es: TEXT, en: TEXT },
};
const VARIANT = {
  sku: "TAL-18V",
  price_usd: "100",
  compare_at_price_usd: "",
  position: "0",
  is_active: true,
  stock: "5",
  attributes: {},
};

describe("category", () => {
  const schema = categorySchema(t);

  it("sends no description and no parent when they are empty", () => {
    expect(schema.parse(CATEGORY)).toMatchObject({ description: null, parent_id: null, position: 0 });
    expect(schema.parse({ ...CATEGORY, parent_id: "4" }).parent_id).toBe(4);
  });

  it("needs a description in both languages or in none", () => {
    expect(issues(schema, { ...CATEGORY, description: { es: "Hola", en: "" } })).toEqual([["description.en", "required"]]);
    expect(issues(schema, { ...CATEGORY, description: { es: "", en: "Hi" } })).toEqual([["description.es", "required"]]);
    expect(schema.parse({ ...CATEGORY, description: { es: "Hola", en: "Hi" } }).description).toEqual({ es: "Hola", en: "Hi" });
  });

  it.each(["con espacios", "-al-inicio", "doble--guion", ""])("rejects the slug %j with one message", (slug) => {
    expect(issues(schema, { ...CATEGORY, slug })).toHaveLength(1);
  });

  it("keeps the position inside the API limit", () => {
    expect(issues(schema, { ...CATEGORY, position: "10001" })).toEqual([["position", "wholeNumber"]]);
  });
});

it("validates a brand", () => {
  expect(issues(brandSchema(t), { slug: "bosch", name: " ", is_active: true })).toEqual([["name", "required"]]);
});

it("validates an attribute and its values", () => {
  const name = { es: "Color", en: "Color" };

  expect(issues(attributeSchema(t), { code: "con-guion", name, is_filterable: true })).toEqual([["code", "code"]]);
  expect(attributeSchema(t).parse({ code: "color_base", name, is_filterable: true }).code).toBe("color_base");
  expect(attributeValueSchema(t).parse({ slug: "rojo", value: name, position: "2" }).position).toBe(2);
});

describe("product", () => {
  const schema = productSchema(t);

  it("turns ids into numbers and the specifications into an object", () => {
    const product = schema.parse({
      ...PRODUCT,
      translations: { es: { ...TEXT, specs: "Potencia: 18 V" }, en: TEXT },
    });

    expect(product).toMatchObject({ category_id: 3, brand_id: null });
    expect(product.translations.es.specs).toEqual({ Potencia: "18 V" });
    expect(product.translations.en.specs).toBeNull();
  });

  it("needs a category and both languages", () => {
    expect(issues(schema, { ...PRODUCT, category_id: "" })).toEqual([["category_id", "required"]]);
    expect(issues(schema, { ...PRODUCT, translations: { es: TEXT, en: { ...TEXT, name: "" } } })).toEqual([
      ["translations.en.name", "required"],
    ]);
  });

  it("explains badly written specifications", () => {
    expect(issues(schema, { ...PRODUCT, translations: { es: { ...TEXT, specs: "sin separador" }, en: TEXT } })).toEqual([
      ["translations.es.specs", "specs"],
    ]);
  });
});

describe("variant", () => {
  const schema = variantSchema(t);

  it("keeps the chosen values and drops the attributes left empty", () => {
    const variant = schema.parse({ ...VARIANT, price_usd: "99,5", attributes: { a1: "11", a2: NO_VALUE, a3: "33" } });

    expect(variant).toMatchObject({ price_usd: "99.5", compare_at_price_usd: null, stock: 5 });
    expect(variant.attribute_value_ids).toEqual([11, 33]);
  });

  it("allows a free product", () => {
    expect(issues(schema, { ...VARIANT, price_usd: "0" })).toEqual([]);
  });

  it("needs the previous price above the price", () => {
    expect(issues(schema, { ...VARIANT, compare_at_price_usd: "100" })).toEqual([["compare_at_price_usd", "compareAt"]]);
    expect(issues(schema, { ...VARIANT, compare_at_price_usd: "100.01" })).toEqual([]);
  });

  it.each([
    ["sku", "CON ESPACIO", "sku"],
    ["sku", "", "required"],
    ["price_usd", "", "amount"],
    ["price_usd", "1.123", "amount"],
    ["stock", "-1", "wholeNumber"],
    ["stock", "1000001", "wholeNumber"],
  ])("rejects %s = %j", (field, value, message) => {
    expect(issues(schema, { ...VARIANT, [field]: value })).toEqual([[field, message]]);
  });
});

describe("stock", () => {
  const schema = stockSchema(t);

  it("reads a signed change", () => {
    expect(schema.parse({ delta: "-5", reason: "Rotura" }).delta).toBe(-5);
    expect(schema.parse({ delta: "+5", reason: "Compra" }).delta).toBe(5);
  });

  it.each(["0", "", "1.5", "1000001", "abc"])("rejects the change %j", (delta) => {
    expect(issues(schema, { delta, reason: "Motivo" })).toEqual([["delta", "stockChange"]]);
  });

  it("needs a reason", () => {
    expect(issues(schema, { delta: "1", reason: " " })).toEqual([["reason", "required"]]);
  });
});

it("needs the alternative text of an image in both languages or in none", () => {
  const schema = imageSchema(t);

  expect(schema.parse({ alt: { es: "", en: "" }, variant_id: NO_VALUE })).toEqual({ alt: null, variant_id: null });
  expect(schema.parse({ alt: { es: "Frente", en: "Front" }, variant_id: "7" }).variant_id).toBe(7);
  expect(issues(schema, { alt: { es: "Frente", en: "" }, variant_id: NO_VALUE })).toEqual([["alt.en", "required"]]);
});
