import { catalogPaths, sitemapEntries } from "./sitemap";
import type { CategoryNode } from "./types";

const TREE: CategoryNode[] = [
  {
    slug: "power-tools",
    name: "Herramientas eléctricas",
    description: null,
    image_url: null,
    children: [{ slug: "drills", name: "Taladros", description: null, image_url: null, children: [] }],
  },
];

it("lists the home page, every category level and every product", () => {
  expect(catalogPaths(TREE, ["bosch-jigsaw"])).toEqual([
    "/",
    "/categories/power-tools",
    "/categories/drills",
    "/products/bosch-jigsaw",
  ]);
});

it("adds each page in every locale with its language alternates", () => {
  const languages = {
    es: "https://shop.example/es/categories/drills",
    en: "https://shop.example/en/categories/drills",
    "x-default": "https://shop.example/es/categories/drills",
  };

  expect(sitemapEntries("https://shop.example", ["/categories/drills"])).toEqual([
    { url: "https://shop.example/es/categories/drills", alternates: { languages } },
    { url: "https://shop.example/en/categories/drills", alternates: { languages } },
  ]);
  expect(sitemapEntries("https://shop.example", ["/"]).map((entry) => entry.url)).toEqual([
    "https://shop.example/es",
    "https://shop.example/en",
  ]);
});
