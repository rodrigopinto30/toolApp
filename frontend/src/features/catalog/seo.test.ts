import { localizedAlternates } from "./seo";

it("points the canonical URL and the alternates to the same path in each locale", () => {
  expect(localizedAlternates("/categories/drills", "en")).toEqual({
    canonical: "/en/categories/drills",
    languages: { es: "/es/categories/drills", en: "/en/categories/drills", "x-default": "/es/categories/drills" },
  });
});

it("keeps the page from the second one on", () => {
  expect(localizedAlternates("/categories/drills", "es", 1).canonical).toBe("/es/categories/drills");
  expect(localizedAlternates("/categories/drills", "es", 3)).toEqual({
    canonical: "/es/categories/drills?page=3",
    languages: {
      es: "/es/categories/drills?page=3",
      en: "/en/categories/drills?page=3",
      "x-default": "/es/categories/drills?page=3",
    },
  });
});
