import { anyPassword, name, newPassword, phone, PHONE_PATTERN, type Translate } from "@/features/auth/schemas";
import type { components } from "@/lib/api/schema";
import { z } from "@/lib/zod";

import { digitsOnly, isValidCuit, isValidDni } from "./tax-id";

type Schemas = components["schemas"];

export const TAX_ID_TYPES = ["CUIT", "DNI"] as const satisfies readonly Schemas["TaxIdType"][];
export const TAX_CONDITIONS = [
  "consumidor_final",
  "monotributo",
  "responsable_inscripto",
  "exento",
] as const satisfies readonly Schemas["TaxCondition"][];

const POSTAL_CODE_PATTERN = /^[A-Za-z0-9]{4,10}$/;

export const text = (t: Translate, max: number) => z.string().trim().min(1, t("required")).max(max, t("tooLong"));
const optionalText = (t: Translate, max: number) => z.string().trim().max(max, t("tooLong"));

export const profileSchema = (t: Translate) =>
  z.object({ first_name: name(t), last_name: name(t), phone: phone(t) });

export const passwordChangeSchema = (t: Translate) =>
  z
    .object({ current_password: anyPassword(t), new_password: newPassword(t), confirm: z.string() })
    .refine((data) => data.new_password === data.confirm, { path: ["confirm"], message: t("passwordMismatch") });

export type ProfileValues = z.input<ReturnType<typeof profileSchema>>;
export type PasswordChangeValues = z.input<ReturnType<typeof passwordChangeSchema>>;

export const addressSchema = (t: Translate) =>
  z.object({
    label: text(t, 40),
    recipient_name: name(t),
    phone: z.string().trim().min(1, t("required")).regex(PHONE_PATTERN, t("phone")),
    street: text(t, 120),
    number: text(t, 20),
    floor_apt: optionalText(t, 20),
    city: text(t, 80),
    province_code: z.string().min(1, t("required")),
    postal_code: z.string().trim().min(1, t("required")).regex(POSTAL_CODE_PATTERN, t("postalCode")),
    notes: optionalText(t, 255),
    is_default: z.boolean(),
  });

export const billingProfileSchema = (t: Translate) =>
  z
    .object({
      tax_id_type: z.enum(TAX_ID_TYPES),
      tax_id: z.string().transform(digitsOnly),
      tax_condition: z.enum(TAX_CONDITIONS),
      legal_name: text(t, 160),
      fiscal_address: text(t, 255),
      is_default: z.boolean(),
    })
    .superRefine((data, context) => {
      if (data.tax_id === "") {
        context.addIssue({ code: "custom", path: ["tax_id"], message: t("required") });
      } else if (data.tax_id_type === "CUIT" && !isValidCuit(data.tax_id)) {
        context.addIssue({ code: "custom", path: ["tax_id"], message: t("cuit") });
      } else if (data.tax_id_type === "DNI" && !isValidDni(data.tax_id)) {
        context.addIssue({ code: "custom", path: ["tax_id"], message: t("dni") });
      }
      if (data.tax_id_type === "DNI" && data.tax_condition !== "consumidor_final") {
        context.addIssue({ code: "custom", path: ["tax_condition"], message: t("dniCondition") });
      }
    });

export type AddressValues = z.input<ReturnType<typeof addressSchema>>;
export type BillingProfileValues = z.input<ReturnType<typeof billingProfileSchema>>;
export type BillingProfileInput = z.output<ReturnType<typeof billingProfileSchema>>;
