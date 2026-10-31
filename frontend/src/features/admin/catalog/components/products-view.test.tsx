import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { ORIGIN } from "@/test/cart";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";

import { ProductsView } from "./products-view";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const mockReplace = jest.fn();

jest.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  usePathname: () => "/admin/products",
  useRouter: () => ({ replace: mockReplace }),
}));

const SUMMARY = {
  id: 5,
  slug: "taladro",
  name: "Taladro",
  brand_id: 2,
  category_id: 3,
  is_active: false,
  is_featured: true,
  variant_count: 2,
  stock: 7,
  price_from_usd: "99.50",
};

function serve() {
  const requests: URL[] = [];
  server.use(
    http.get(`${ORIGIN}/api/v1/admin/categories`, () =>
      HttpResponse.json({
        items: [{ id: 3, parent_id: null, slug: "t", name: { es: "Taladros", en: "Drills" }, is_active: true }],
        page: 1,
        size: 100,
        total: 1,
        pages: 1,
      }),
    ),
    http.get(`${ORIGIN}/api/v1/admin/brands`, () =>
      HttpResponse.json({ items: [{ id: 2, slug: "b", name: "Bosch", is_active: true }], page: 1, size: 100, total: 1, pages: 1 }),
    ),
    http.get(`${ORIGIN}/api/v1/admin/products`, ({ request }) => {
      requests.push(new URL(request.url));
      return HttpResponse.json({ items: [SUMMARY], page: 1, size: 20, total: 1, pages: 1 });
    }),
  );
  return requests;
}

it("lists a product with its names, price, stock and status", async () => {
  serve();
  renderWithProviders(<ProductsView />, { hasSession: true });

  const row = (await screen.findByRole("link", { name: "Taladro" })).closest("tr") as HTMLElement;
  expect(screen.getByRole("link", { name: "Taladro" })).toHaveAttribute("href", "/admin/products/5");
  await waitFor(() => expect(row).toHaveTextContent("Taladros"));
  await waitFor(() => expect(row).toHaveTextContent("Bosch"));
  expect(row).toHaveTextContent("Destacado");
  expect(row).toHaveTextContent("99,50");
  expect(row).toHaveTextContent("Inactivo");
});

it("reads the filters from the URL", async () => {
  const requests = serve();
  renderWithProviders(<ProductsView />, { hasSession: true, searchParams: "?q=taladro&category=3&status=archived" });

  await waitFor(() => expect(requests.length).toBeGreaterThan(0));
  const query = requests[0].searchParams;
  expect(query.get("q")).toBe("taladro");
  expect(query.get("category_id")).toBe("3");
  expect(query.get("is_active")).toBe("false");
  expect(query.get("locale")).toBe("es");
  expect(query.has("brand_id")).toBe(false);
});

it("does not send a search the API would reject", async () => {
  const requests = serve();
  renderWithProviders(<ProductsView />, { hasSession: true, searchParams: "?q=a" });

  await waitFor(() => expect(requests.length).toBeGreaterThan(0));
  expect(requests[0].searchParams.has("q")).toBe(false);
});

it("searches and goes back to the first page", async () => {
  const requests = serve();
  renderWithProviders(<ProductsView />, { hasSession: true, searchParams: "?page=3" });
  const user = userEvent.setup();

  await user.type(await screen.findByRole("searchbox", { name: "Buscar" }), "taladro{Enter}");

  await waitFor(() => expect(requests.at(-1)?.searchParams.get("q")).toBe("taladro"));
  expect(requests.at(-1)?.searchParams.get("page")).toBe("1");
});
