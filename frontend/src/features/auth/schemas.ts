import { z } from "@/lib/zod";

export type ValidationKey =
  | "required"
  | "email"
  | "passwordLength"
  | "passwordIsEmail"
  | "passwordMismatch"
  | "nameLength"
  | "phone"
  | "quantity"
  | "invalid"
  | "tooLong"
  | "postalCode"
  | "cuit"
  | "dni"
  | "dniCondition"
  | "cardNumber"
  | "cardExpiry"
  | "cardExpired"
  | "cardCvc"
  | "rating"
  | "amount"
  | "rate"
  | "code"
  | "wholeNumber"
  | "etaRange"
  | "percent"
  | "period";

export type Translate = (key: ValidationKey) => string;

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const PHONE_PATTERN = /^\+?[0-9 ()-]{6,30}$/;

export const email = (t: Translate) =>
  z
    .string()
    .trim()
    .toLowerCase()
    .min(1, { error: t("required"), abort: true })
    .max(254, t("email"))
    .regex(EMAIL_PATTERN, t("email"));

export const newPassword = (t: Translate) => z.string().min(10, t("passwordLength")).max(128, t("passwordLength"));

export const anyPassword = (t: Translate) => z.string().min(1, t("required")).max(128, t("passwordLength"));

export const name = (t: Translate) => z.string().trim().min(1, t("required")).max(80, t("nameLength"));

export const phone = (t: Translate) =>
  z
    .string()
    .trim()
    .refine((value) => value === "" || PHONE_PATTERN.test(value), t("phone"));

export const loginSchema = (t: Translate) => z.object({ email: email(t), password: anyPassword(t) });

export const registerSchema = (t: Translate) =>
  z
    .object({
      first_name: name(t),
      last_name: name(t),
      email: email(t),
      password: newPassword(t),
    })
    .refine((data) => data.password.trim().toLowerCase() !== data.email, {
      path: ["password"],
      message: t("passwordIsEmail"),
    });

export const forgotPasswordSchema = (t: Translate) => z.object({ email: email(t) });

export const resetPasswordSchema = (t: Translate) =>
  z
    .object({ password: newPassword(t), confirm: z.string() })
    .refine((data) => data.password === data.confirm, { path: ["confirm"], message: t("passwordMismatch") });

export type LoginValues = z.input<ReturnType<typeof loginSchema>>;
export type RegisterValues = z.input<ReturnType<typeof registerSchema>>;
export type ForgotPasswordValues = z.input<ReturnType<typeof forgotPasswordSchema>>;
export type ResetPasswordValues = z.input<ReturnType<typeof resetPasswordSchema>>;
