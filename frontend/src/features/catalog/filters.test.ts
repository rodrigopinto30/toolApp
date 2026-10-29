import { filterGroups } from "./filters";
import { loadCatalogSearchParams } from "./search-params";
import type { Attribute, Brand, ProductFacets } from "./types";

const BRANDS: Brand[] = [
  { slug: "bosch", name: "Bosch", logo_url: null },
  { slug: "makita", name: "Makita", logo_url: null },
];
const ATTRIBUTES: Attribute[] = [
  { code: "voltage", name: "Voltaje", values: [{ slug: "12v", label: "12V" }, { slug: "18v", label: "18V" }] },
  { code: "color", name: "Color", values: [{ slug: "grey", label: "Gris" }] },
];
const FACETS: ProductFacets = {
  brands: [{ slug: "bosch", label: "Bosch", count: 4 }],
  attributes: [{ code: "voltage", name: "Voltaje", values: [{ slug: "18v", label: "18V", count: 2 }] }],
  price: null,
};

it("builds one group per facet with values and counts", () => {
  expect(filterGroups(FACETS, loadCatalogSearchParams(""), BRANDS, ATTRIBUTES)).toEqual([
    { param: "brand", key: "brand", title: null, options: [{ value: "bosch", label: "Bosch", count: 4 }] },
    { param: "attr", key: "voltage", title: "Voltaje", options: [{ value: "voltage:18v", label: "18V", count: 2 }] },
  ]);
});

it("keeps selected values without results, so they can be unselected", () => {
  const state = loadCatalogSearchParams("?brand=makita&attr=voltage:12v&attr=color:grey&brand=stihl");

  const groups = filterGroups(FACETS, state, BRANDS, ATTRIBUTES);

  expect(groups.map((group) => group.options)).toEqual([
    [
      { value: "bosch", label: "Bosch", count: 4 },
      { value: "makita", label: "Makita", count: 0 },
    ],
    [
      { value: "voltage:18v", label: "18V", count: 2 },
      { value: "voltage:12v", label: "12V", count: 0 },
    ],
    [{ value: "color:grey", label: "Gris", count: 0 }],
  ]);
});
