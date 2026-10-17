import { safeRedirect } from "./safe-redirect";

it.each([
  ["/es/account", "/es/account"],
  ["/en/account?tab=orders", "/en/account?tab=orders"],
  ["/es/products/drill", "/es/products/drill"],
])("keeps internal paths (%s)", (target, expected) => {
  expect(safeRedirect(target, "es")).toBe(expected);
});

it.each([
  undefined,
  "",
  "https://evil.example/es/account",
  "//evil.example/es/account",
  "/\\evil.example",
  "/\t/evil.example",
  "javascript:alert(1)",
  "es/account",
  "/fr/account",
  "/account",
  "/es/login",
  "/es/register?next=/es/account",
  "/en/reset-password",
])("falls back to the account page for %p", (target) => {
  expect(safeRedirect(target, "en")).toBe("/en/account");
});
