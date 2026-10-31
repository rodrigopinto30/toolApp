import { text } from "@/features/account/schemas";
import type { Translate } from "@/features/auth/schemas";
import { z } from "@/lib/zod";

import { areValidSpecs, parseSpecs } from "./specs";

export const NO_VALUE = "none";

const SLUG_PATTERN = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/;
const ATTRIBUTE_CODE_PATTERN = /^[A-Za-z0-9_]+$/;
const SKU_PATTERN = /^[A-Za-z0-9._-]+$/;
const AMOUNT_PATTERN = /^\d{1,10}(?:\.\d{1,2})?$/;
const WHOLE_NUMBER_PATTERN = /^\d{1,7}$/;
const STOCK_CHANGE_PATTERN = /^[+-]?\d{1,7}$/;
const MAX_POSITION = 10_000;
const MAX_STOCK = 1_000_000;

const slug = (t: Translate, max: number) =>
  z.string().trim().min(1, { error: t("required"), abort: true }).max(max, t("slug")).regex(SLUG_PATTERN, t("slug"));

const decimal = () =>
  z
    .string()
    .trim()
    .transform((value) => value.replace(",", "."));

const position = (t: Translate) =>
  z
    .string()
    .trim()
    .refine((value) => WHOLE_NUMBER_PATTERN.test(value) && Number(value) <= MAX_POSITION, t("wholeNumber"))
    .transform(Number);

const optionalId = () =>
  z.string().transform((value) => (value === NO_VALUE ? null : Number(value)));

const i18nName = (t: Translate) => z.object({ es: text(t, 120), en: text(t, 120) });

const bothOrNone = (t: Translate, max: number) =>
  z
    .object({ es: z.string().trim().max(max, t("tooLong")), en: z.string().trim().max(max, t("tooLong")) })
    .superRefine((value, context) => {
      if (value.es && !value.en) {
        context.addIssue({ code: "custom", path: ["en"], message: t("required") });
      }
      if (value.en && !value.es) {
        context.addIssue({ code: "custom", path: ["es"], message: t("required") });
      }
    })
    .transform((value) => (value.es ? value : null));

export const categorySchema = (t: Translate) =>
  z.object({
    slug: slug(t, 120),
    name: i18nName(t),
    description: bothOrNone(t, 1000),
    parent_id: optionalId(),
    position: position(t),
    is_active: z.boolean(),
  });

export const brandSchema = (t: Translate) =>
  z.object({ slug: slug(t, 120), name: text(t, 120), is_active: z.boolean() });

export const attributeSchema = (t: Translate) =>
  z.object({
    code: z.string().trim().min(1, t("code")).max(40, t("code")).regex(ATTRIBUTE_CODE_PATTERN, t("code")),
    name: i18nName(t),
    is_filterable: z.boolean(),
  });

export const attributeValueSchema = (t: Translate) =>
  z.object({ slug: slug(t, 60), value: i18nName(t), position: position(t) });

const productText = (t: Translate) =>
  z.object({
    name: text(t, 200),
    short_description: text(t, 500),
    description: text(t, 10_000),
    specs: z.string().refine(areValidSpecs, t("specs")).transform(parseSpecs),
  });

export const productSchema = (t: Translate) =>
  z.object({
    slug: slug(t, 160),
    category_id: z.string().min(1, { error: t("required"), abort: true }).transform(Number),
    brand_id: optionalId(),
    is_featured: z.boolean(),
    translations: z.object({ es: productText(t), en: productText(t) }),
  });

export const variantSchema = (t: Translate) =>
  z
    .object({
      sku: z.string().trim().min(1, { error: t("required"), abort: true }).max(64, t("sku")).regex(SKU_PATTERN, t("sku")),
      price_usd: decimal().refine((value) => AMOUNT_PATTERN.test(value), t("amount")),
      compare_at_price_usd: decimal()
        .refine((value) => value === "" || (AMOUNT_PATTERN.test(value) && Number(value) > 0), t("amount"))
        .transform((value) => value || null),
      position: position(t),
      is_active: z.boolean(),
      stock: z
        .string()
        .trim()
        .refine((value) => WHOLE_NUMBER_PATTERN.test(value) && Number(value) <= MAX_STOCK, t("wholeNumber"))
        .transform(Number),
      attributes: z.record(z.string(), z.string()),
    })
    .superRefine((data, context) => {
      if (data.compare_at_price_usd !== null && Number(data.compare_at_price_usd) <= Number(data.price_usd)) {
        context.addIssue({ code: "custom", path: ["compare_at_price_usd"], message: t("compareAt") });
      }
    })
    .transform(({ attributes, ...variant }) => ({
      ...variant,
      attribute_value_ids: Object.values(attributes)
        .filter((value) => value !== NO_VALUE)
        .map(Number),
    }));

export const stockSchema = (t: Translate) =>
  z.object({
    delta: z
      .string()
      .trim()
      .refine(
        (value) =>
          STOCK_CHANGE_PATTERN.test(value) && Number(value) !== 0 && Math.abs(Number(value)) <= MAX_STOCK,
        t("stockChange"),
      )
      .transform(Number),
    reason: text(t, 255),
  });

export const imageSchema = (t: Translate) =>
  z.object({ alt: bothOrNone(t, 120), variant_id: optionalId() });

export type CategoryValues = z.input<ReturnType<typeof categorySchema>>;
export type CategoryInput = z.output<ReturnType<typeof categorySchema>>;
export type BrandValues = z.input<ReturnType<typeof brandSchema>>;
export type AttributeValues = z.input<ReturnType<typeof attributeSchema>>;
export type AttributeValueValues = z.input<ReturnType<typeof attributeValueSchema>>;
export type AttributeValueInput = z.output<ReturnType<typeof attributeValueSchema>>;
export type ProductValues = z.input<ReturnType<typeof productSchema>>;
export type ProductInput = z.output<ReturnType<typeof productSchema>>;
export type VariantValues = z.input<ReturnType<typeof variantSchema>>;
export type VariantInput = z.output<ReturnType<typeof variantSchema>>;
export type StockValues = z.input<ReturnType<typeof stockSchema>>;
export type StockInput = z.output<ReturnType<typeof stockSchema>>;
export type ImageValues = z.input<ReturnType<typeof imageSchema>>;
export type ImageInput = z.output<ReturnType<typeof imageSchema>>;
