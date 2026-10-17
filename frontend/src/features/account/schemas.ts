import { z } from "zod";

import { anyPassword, name, newPassword, phone, type Translate } from "@/features/auth/schemas";

export const profileSchema = (t: Translate) =>
  z.object({ first_name: name(t), last_name: name(t), phone: phone(t) });

export const passwordChangeSchema = (t: Translate) =>
  z
    .object({ current_password: anyPassword(t), new_password: newPassword(t), confirm: z.string() })
    .refine((data) => data.new_password === data.confirm, { path: ["confirm"], message: t("passwordMismatch") });

export type ProfileValues = z.input<ReturnType<typeof profileSchema>>;
export type PasswordChangeValues = z.input<ReturnType<typeof passwordChangeSchema>>;
