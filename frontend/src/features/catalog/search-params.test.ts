import {
  knownFilters,
  loadCatalogSearchParams,
  serializeCatalogSearchParams,
  toFilterQuery,
  toProductQuery,
  type CatalogContext,
  type CatalogSearchState,
} from "./search-params";

const CONTEXT: CatalogContext = {
  locale: "es",
  currency: "ARS",
  known: knownFilters(
    [
      { slug: "bosch", name: "Bosch", logo_url: null },
      { slug: "makita", name: "Makita", logo_url: null },
    ],
    [{ code: "voltage", name: "Voltaje", values: [{ slug: "18v", label: "18V" }] }],
  ),
};

const EMPTY: CatalogSearchState = loadCatalogSearchParams("");

describe("loadCatalogSearchParams", () => {
  it("reads every filter from the URL", () => {
    expect(
      loadCatalogSearchParams(
        "?q=%20taladro%20&brand=bosch&brand=makita&attr=voltage:18v&min=100&max=250.5&stock=true&sort=price_asc&page=3",
      ),
    ).toEqual({
      q: "taladro",
      brand: ["bosch", "makita"],
      attr: ["voltage:18v"],
      min: "100",
      max: "250.5",
      stock: true,
      sort: "price_asc",
      page: 3,
    });
  });

  it("drops malformed values and falls back to the defaults", () => {
    expect(
      loadCatalogSearchParams(
        "?q=%20&brand=Bosch!&brand=makita&attr=voltage&min=-1&max=1.234&stock=maybe&sort=random&page=1001",
      ),
    ).toEqual({ ...EMPTY, brand: ["makita"] });
    expect(EMPTY).toEqual({
      q: null,
      brand: [],
      attr: [],
      min: null,
      max: null,
      stock: false,
      sort: null,
      page: 1,
    });
  });
});

describe("serializeCatalogSearchParams", () => {
  it("writes repeated keys and leaves the defaults out", () => {
    expect(
      serializeCatalogSearchParams("/es/categories/drills", { brand: ["bosch", "makita"], stock: false, page: 1 }),
    ).toBe("/es/categories/drills?brand=bosch&brand=makita");
    expect(serializeCatalogSearchParams("/es/search", { q: "taladro", page: 2 })).toBe("/es/search?q=taladro&page=2");
  });
});

describe("toFilterQuery", () => {
  it("maps the URL state to the API parameters", () => {
    const state = loadCatalogSearchParams("?q=taladro&brand=bosch&attr=voltage:18v&min=100&max=200&stock=true");

    expect(toFilterQuery(state, { ...CONTEXT, category: "drills" })).toEqual({
      locale: "es",
      currency: "ARS",
      category: "drills",
      q: "taladro",
      brand: ["bosch"],
      "attr[]": ["voltage:18v"],
      min_price: "100",
      max_price: "200",
      in_stock: true,
    });
  });

  it("drops unknown or repeated values, a short query and a reversed price range", () => {
    const state = loadCatalogSearchParams(
      "?q=t&brand=bosch&brand=bosch&brand=stihl&attr=voltage:18v&attr=color:red&min=300&max=200",
    );

    expect(toFilterQuery(state, CONTEXT)).toEqual({
      locale: "es",
      currency: "ARS",
      brand: ["bosch"],
      "attr[]": ["voltage:18v"],
    });
  });

  it("forwards at most 20 values of a filter", () => {
    const brands = Array.from({ length: 25 }, (_, index) => `brand-${index}`);
    const known = { ...CONTEXT.known, brands: new Set(brands) };

    expect(toFilterQuery({ ...EMPTY, brand: brands }, { ...CONTEXT, known }).brand).toHaveLength(20);
  });
});

describe("toProductQuery", () => {
  it("adds the sort and the page to the filters", () => {
    expect(toProductQuery({ ...EMPTY, sort: "name", page: 2 }, CONTEXT)).toEqual({
      locale: "es",
      currency: "ARS",
      sort: "name",
      page: 2,
    });
  });
});
