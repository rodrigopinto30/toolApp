import type { Translate } from "@/features/auth/schemas";
import { z } from "@/lib/zod";

import { isExpired, parseExpiry, validCardNumber } from "./card";

export const cardSchema = (t: Translate, now: () => Date = () => new Date()) =>
  z.object({
    card_number: z
      .string()
      .min(1, { error: t("required"), abort: true })
      .refine(validCardNumber, t("cardNumber")),
    expiry: z
      .string()
      .trim()
      .min(1, { error: t("required"), abort: true })
      .superRefine((value, context) => {
        const parsed = parseExpiry(value);
        if (!parsed) {
          context.addIssue({ code: "custom", message: t("cardExpiry") });
        } else if (isExpired(parsed, now())) {
          context.addIssue({ code: "custom", message: t("cardExpired") });
        }
      }),
    cvc: z.string().trim().regex(/^\d{3,4}$/, t("cardCvc")),
    holder: z.string().trim().min(1, t("required")).max(120, t("tooLong")),
  });

export type CardValues = z.input<ReturnType<typeof cardSchema>>;
