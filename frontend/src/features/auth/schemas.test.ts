import { passwordChangeSchema, profileSchema } from "@/features/account/schemas";

import { loginSchema, registerSchema, resetPasswordSchema, type ValidationKey } from "./schemas";

const t = (key: ValidationKey) => key;

function messages(result: { success: boolean; error?: { issues: { message: string }[] } }): string[] {
  return result.error?.issues.map((issue) => issue.message) ?? [];
}

describe("register", () => {
  const valid = { first_name: " Ana ", last_name: "Diaz", email: " Ana@Example.COM ", password: "a-long-password" };

  it("trims names and normalizes the email like the backend", () => {
    expect(registerSchema(t).parse(valid)).toEqual({
      first_name: "Ana",
      last_name: "Diaz",
      email: "ana@example.com",
      password: "a-long-password",
    });
  });

  it.each([
    [{ password: "short" }, "passwordLength"],
    [{ password: "x".repeat(129) }, "passwordLength"],
    [{ password: "ANA@example.com" }, "passwordIsEmail"],
    [{ email: "ana@" }, "email"],
    [{ first_name: "   " }, "required"],
    [{ last_name: "x".repeat(81) }, "nameLength"],
  ])("rejects %o", (override, message) => {
    expect(messages(registerSchema(t).safeParse({ ...valid, ...override }))).toContain(message);
  });
});

it("asks for both login fields", () => {
  expect(messages(loginSchema(t).safeParse({ email: "", password: "" }))).toEqual(["required", "required"]);
});

it("requires matching passwords to reset or change it", () => {
  expect(messages(resetPasswordSchema(t).safeParse({ password: "a-long-password", confirm: "other" }))).toEqual([
    "passwordMismatch",
  ]);
  expect(
    messages(
      passwordChangeSchema(t).safeParse({ current_password: "x", new_password: "a-long-password", confirm: "y" }),
    ),
  ).toEqual(["passwordMismatch"]);
});

it("accepts an empty phone and rejects letters", () => {
  const base = { first_name: "Ana", last_name: "Diaz" };
  expect(profileSchema(t).safeParse({ ...base, phone: "" }).success).toBe(true);
  expect(profileSchema(t).safeParse({ ...base, phone: "+54 11 5555-5555" }).success).toBe(true);
  expect(messages(profileSchema(t).safeParse({ ...base, phone: "call me" }))).toEqual(["phone"]);
});
