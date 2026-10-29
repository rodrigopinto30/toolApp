import type { CatalogSearchState } from "./search-params";
import type { Attribute, Brand, ProductFacets } from "./types";

export type FilterOption = { value: string; label: string; count: number };

export type FilterGroup = {
  param: "brand" | "attr";
  key: string;
  title: string | null;
  options: FilterOption[];
};

function withSelected(
  options: FilterOption[],
  selected: string[],
  labelOf: (value: string) => string | undefined,
): FilterOption[] {
  const present = new Set(options.map((option) => option.value));
  const missing = selected.flatMap((value) => {
    const label = present.has(value) ? undefined : labelOf(value);
    return label ? [{ value, label, count: 0 }] : [];
  });
  return [...options, ...missing];
}

export function filterGroups(
  facets: ProductFacets,
  state: CatalogSearchState,
  brands: Brand[],
  attributes: Attribute[],
): FilterGroup[] {
  const brandGroup: FilterGroup = {
    param: "brand",
    key: "brand",
    title: null,
    options: withSelected(
      facets.brands.map(({ slug, label, count }) => ({ value: slug, label, count })),
      state.brand,
      (slug) => brands.find((brand) => brand.slug === slug)?.name,
    ),
  };
  const attributeGroups = attributes.map((attribute): FilterGroup => {
    const facet = facets.attributes.find((candidate) => candidate.code === attribute.code);
    const valueOf = (slug: string) => `${attribute.code}:${slug}`;
    return {
      param: "attr",
      key: attribute.code,
      title: attribute.name,
      options: withSelected(
        (facet?.values ?? []).map(({ slug, label, count }) => ({ value: valueOf(slug), label, count })),
        state.attr.filter((value) => value.startsWith(`${attribute.code}:`)),
        (value) => attribute.values.find((candidate) => valueOf(candidate.slug) === value)?.label,
      ),
    };
  });
  return [brandGroup, ...attributeGroups].filter((group) => group.options.length > 0);
}
