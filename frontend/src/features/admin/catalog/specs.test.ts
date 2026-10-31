import { areValidSpecs, formatSpecs, parseSpecs } from "./specs";

it("round-trips the specifications through the text field", () => {
  const specs = { Potencia: "800 W", Voltaje: "220 V" };

  expect(formatSpecs(specs)).toBe("Potencia: 800 W\nVoltaje: 220 V");
  expect(parseSpecs(formatSpecs(specs))).toEqual(specs);
});

it("shows values that are not text and treats nothing as empty", () => {
  expect(formatSpecs({ Inalámbrico: true, Peso: 2 })).toBe("Inalámbrico: true\nPeso: 2");
  expect(formatSpecs(null)).toBe("");
  expect(parseSpecs(" \n ")).toBeNull();
});

it("splits on the first colon only and ignores blank lines", () => {
  expect(parseSpecs("Relación: 16:9\n\n  Color : Rojo  ")).toEqual({ Relación: "16:9", Color: "Rojo" });
});

it.each([
  ["no separator", "Potencia 800 W"],
  ["no name", ": 800 W"],
  ["no value", "Potencia:"],
  ["a repeated name", "Color: Rojo\nColor: Azul"],
  ["a long name", `${"a".repeat(81)}: valor`],
  ["a long value", `Nombre: ${"a".repeat(256)}`],
  ["too many lines", Array.from({ length: 51 }, (_, index) => `n${index}: v`).join("\n")],
])("rejects %s", (_, value) => {
  expect(areValidSpecs(value)).toBe(false);
});

it("accepts an empty field", () => {
  expect(areValidSpecs("")).toBe(true);
});
