import { text } from "@/features/account/schemas";
import type { Translate } from "@/features/auth/schemas";
import { z } from "@/lib/zod";

import { fromLocalInput } from "./dates";

export const COUPON_TYPES = ["percent", "fixed"] as const;
export const OPENING_DAYS = ["mon_fri", "sat", "sun"] as const;

const AMOUNT_PATTERN = /^\d{1,10}(?:\.\d{1,2})?$/;
const RATE_PATTERN = /^\d{1,12}(?:\.\d{1,6})?$/;
const WHOLE_NUMBER_PATTERN = /^\d{1,10}$/;
const CODE_PATTERN = /^[A-Za-z0-9_-]+$/;
const MAX_PERCENT = 100;
const MAX_ETA_DAYS = 365;
const MAX_USES = 2_147_483_647;

const decimal = () =>
  z
    .string()
    .trim()
    .transform((value) => value.replace(",", "."));

const amount = (t: Translate) => decimal().refine((value) => AMOUNT_PATTERN.test(value), t("amount"));

const positiveAmount = (t: Translate) =>
  decimal().refine((value) => AMOUNT_PATTERN.test(value) && Number(value) > 0, t("amount"));

const optionalAmount = (t: Translate) =>
  decimal()
    .refine((value) => value === "" || AMOUNT_PATTERN.test(value), t("amount"))
    .transform((value) => value || null);

const code = (t: Translate, min: number) =>
  z.string().trim().min(min, t("code")).max(40, t("code")).regex(CODE_PATTERN, t("code"));

const days = (t: Translate) =>
  z
    .string()
    .trim()
    .refine((value) => WHOLE_NUMBER_PATTERN.test(value) && Number(value) <= MAX_ETA_DAYS, t("wholeNumber"))
    .transform(Number);

const usageLimit = (t: Translate) =>
  z
    .string()
    .trim()
    .refine(
      (value) => value === "" || (WHOLE_NUMBER_PATTERN.test(value) && Number(value) > 0 && Number(value) <= MAX_USES),
      t("wholeNumber"),
    )
    .transform((value) => (value === "" ? null : Number(value)));

const dateTime = (t: Translate) =>
  z
    .string()
    .min(1, { error: t("required"), abort: true })
    .refine((value) => !Number.isNaN(Date.parse(value)), t("invalid"))
    .transform(fromLocalInput);

const optionalDateTime = (t: Translate) =>
  z
    .string()
    .refine((value) => value === "" || !Number.isNaN(Date.parse(value)), t("invalid"))
    .transform((value) => (value === "" ? null : fromLocalInput(value)));

export const exchangeRateSchema = (t: Translate) =>
  z.object({
    rate: decimal().refine((value) => RATE_PATTERN.test(value) && Number(value) > 0, t("rate")),
  });

export const couponSchema = (t: Translate) =>
  z
    .object({
      code: code(t, 3),
      type: z.enum(COUPON_TYPES),
      value: positiveAmount(t),
      min_subtotal_usd: optionalAmount(t),
      starts_at: dateTime(t),
      ends_at: optionalDateTime(t),
      max_uses: usageLimit(t),
      max_uses_per_user: usageLimit(t),
      is_active: z.boolean(),
    })
    .superRefine((data, context) => {
      if (data.type === "percent" && Number(data.value) > MAX_PERCENT) {
        context.addIssue({ code: "custom", path: ["value"], message: t("percent") });
      }
      if (data.ends_at !== null && data.ends_at <= data.starts_at) {
        context.addIssue({ code: "custom", path: ["ends_at"], message: t("period") });
      }
    });

export const zoneSchema = (t: Translate) =>
  z
    .object({
      code: code(t, 2),
      name: z.object({ es: text(t, 120), en: text(t, 120) }),
      cost_usd: amount(t),
      free_over_usd: decimal()
        .refine((value) => value === "" || (AMOUNT_PATTERN.test(value) && Number(value) > 0), t("amount"))
        .transform((value) => value || null),
      eta_min_days: days(t),
      eta_max_days: days(t),
      is_active: z.boolean(),
    })
    .refine((data) => data.eta_min_days <= data.eta_max_days, { path: ["eta_max_days"], message: t("etaRange") });

export const pickupPointSchema = (t: Translate) =>
  z.object({
    name: text(t, 120),
    address: text(t, 255),
    hours: z.object({
      mon_fri: z.string().trim().max(80, t("tooLong")),
      sat: z.string().trim().max(80, t("tooLong")),
      sun: z.string().trim().max(80, t("tooLong")),
    }),
    is_active: z.boolean(),
  });

export type ExchangeRateValues = z.input<ReturnType<typeof exchangeRateSchema>>;
export type ExchangeRateInput = z.output<ReturnType<typeof exchangeRateSchema>>;
export type CouponValues = z.input<ReturnType<typeof couponSchema>>;
export type CouponInput = z.output<ReturnType<typeof couponSchema>>;
export type ZoneValues = z.input<ReturnType<typeof zoneSchema>>;
export type ZoneInput = z.output<ReturnType<typeof zoneSchema>>;
export type PickupPointValues = z.input<ReturnType<typeof pickupPointSchema>>;
