import type { Translate } from "@/features/auth/schemas";
import { z } from "@/lib/zod";

export const DELIVERY_METHODS = ["shipping", "pickup"] as const;
export const MAX_QUANTITY = 99;

export const shippingQuoteSchema = (t: Translate) =>
  z
    .object({
      method: z.enum(DELIVERY_METHODS),
      province: z.string(),
      quantity: z.number({ error: t("quantity") }).int(t("quantity")).min(1, t("quantity")).max(MAX_QUANTITY, t("quantity")),
    })
    .refine((data) => data.method === "pickup" || data.province !== "", {
      path: ["province"],
      message: t("required"),
    });

export type ShippingQuoteValues = z.input<ReturnType<typeof shippingQuoteSchema>>;
