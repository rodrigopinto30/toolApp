import { BODY_MAX_LENGTH, reviewSchema, TITLE_MAX_LENGTH } from "./schemas";

const schema = reviewSchema((key) => key);
const VALID = { rating: 4, title: "Muy bueno", body: "Lo uso todos los días." };

function errorsOf(values: object) {
  const result = schema.safeParse({ ...VALID, ...values });
  return result.success ? [] : result.error.issues.map((issue) => [issue.path[0], issue.message]);
}

it("accepts a rating from 1 to 5 and trims the texts", () => {
  expect(schema.parse({ ...VALID, title: "  Muy bueno  " }).title).toBe("Muy bueno");
  expect(errorsOf({ rating: 1 })).toEqual([]);
  expect(errorsOf({ rating: 5 })).toEqual([]);
});

it("asks for a rating", () => {
  expect(errorsOf({ rating: 0 })).toEqual([["rating", "rating"]]);
  expect(errorsOf({ rating: 6 })).toEqual([["rating", "rating"]]);
});

it("needs a title and a body inside the API limits", () => {
  expect(errorsOf({ title: "   " })).toEqual([["title", "required"]]);
  expect(errorsOf({ body: "" })).toEqual([["body", "required"]]);
  expect(errorsOf({ title: "a".repeat(TITLE_MAX_LENGTH + 1) })).toEqual([["title", "tooLong"]]);
  expect(errorsOf({ body: "a".repeat(BODY_MAX_LENGTH + 1) })).toEqual([["body", "tooLong"]]);
});
