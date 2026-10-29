import type { ProductDetail } from "./types";

export type Variant = ProductDetail["variants"][number];

export type VariantOption = {
  code: string;
  name: string;
  values: { slug: string; label: string }[];
};

export function variantOptions(variants: Variant[]): VariantOption[] {
  const options = new Map<string, VariantOption>();
  for (const { attributes } of variants) {
    for (const attribute of attributes) {
      const option = options.get(attribute.code) ?? { code: attribute.code, name: attribute.name, values: [] };
      if (!option.values.some((value) => value.slug === attribute.value_slug)) {
        option.values.push({ slug: attribute.value_slug, label: attribute.value });
      }
      options.set(attribute.code, option);
    }
  }
  return [...options.values()];
}

export function defaultVariant(variants: Variant[]): Variant {
  return variants.find((variant) => variant.stock_status !== "out_of_stock") ?? variants[0];
}

export function variantBySku(variants: Variant[], sku: string | null): Variant {
  return variants.find((variant) => variant.sku === sku) ?? defaultVariant(variants);
}

export function valueOf(variant: Variant, code: string): string | undefined {
  return variant.attributes.find((attribute) => attribute.code === code)?.value_slug;
}

function matchScore(variant: Variant, current: Variant, changedCode: string): number {
  const kept = current.attributes.filter(
    (attribute) => attribute.code !== changedCode && valueOf(variant, attribute.code) === attribute.value_slug,
  ).length;
  return kept * 2 + (variant.stock_status === "out_of_stock" ? 0 : 1);
}

export function chooseVariant(variants: Variant[], current: Variant, code: string, slug: string): Variant {
  let best: Variant | undefined;
  for (const variant of variants) {
    if (valueOf(variant, code) !== slug) {
      continue;
    }
    if (!best || matchScore(variant, current, code) > matchScore(best, current, code)) {
      best = variant;
    }
  }
  return best ?? current;
}
