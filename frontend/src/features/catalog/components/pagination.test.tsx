import { screen } from "@testing-library/react";

import { loadCatalogSearchParams } from "@/features/catalog/search-params";
import { renderWithProviders } from "@/test/render";

import { Pagination } from "./pagination";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}));

jest.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

it("links every page with the current filters and marks the current one", () => {
  renderWithProviders(
    <Pagination page={2} pages={5} path="/categories/drills" state={loadCatalogSearchParams("?brand=bosch&page=2")} />,
  );

  const nav = screen.getByRole("navigation", { name: "Paginación" });
  expect(nav).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Anterior" })).toHaveAttribute("href", "/categories/drills?brand=bosch");
  expect(screen.getByRole("link", { name: "Siguiente" })).toHaveAttribute(
    "href",
    "/categories/drills?brand=bosch&page=3",
  );
  expect(screen.getByRole("link", { name: "Página 2" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("link", { name: "Página 5" })).toHaveAttribute("href", "/categories/drills?brand=bosch&page=5");
});

it("is not rendered for a single page", () => {
  renderWithProviders(<Pagination page={1} pages={1} path="/search" state={loadCatalogSearchParams("?q=taladro")} />);

  expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
});
