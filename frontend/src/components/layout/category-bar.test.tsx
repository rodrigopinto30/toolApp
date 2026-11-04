import { screen, within } from "@testing-library/react";

import { renderWithUrl } from "@/test/render";

import { CategoryBar } from "./category-bar";

jest.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

it("links every top category from its own navigation", () => {
  renderWithUrl(
    <CategoryBar
      categories={[
        { slug: "power-tools", name: "Herramientas eléctricas" },
        { slug: "garden", name: "Jardín" },
      ]}
    />,
  );

  const links = within(screen.getByRole("navigation", { name: "Categorías principales" })).getAllByRole("link");
  expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
    ["Herramientas eléctricas", "/categories/power-tools"],
    ["Jardín", "/categories/garden"],
  ]);
});
