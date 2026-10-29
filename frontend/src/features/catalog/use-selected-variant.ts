"use client";

import { parseAsString, useQueryState } from "nuqs";

import { variantBySku, type Variant } from "./variants";

export const VARIANT_PARAM = "variant";

export function useSelectedVariant(variants: Variant[]) {
  const [sku, setSku] = useQueryState(VARIANT_PARAM, parseAsString.withOptions({ scroll: false }));

  return [variantBySku(variants, sku), (variant: Variant) => void setSku(variant.sku)] as const;
}
