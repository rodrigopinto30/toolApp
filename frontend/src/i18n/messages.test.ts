import en from "../../messages/en.json";
import es from "../../messages/es.json";

function keys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) {
    return [prefix];
  }
  return Object.entries(value).flatMap(([key, child]) => keys(child, prefix ? `${prefix}.${key}` : key));
}

it("defines the same messages in every locale", () => {
  expect(keys(en).sort()).toEqual(keys(es).sort());
});
