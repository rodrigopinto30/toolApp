import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";

import { ORIGIN } from "@/test/cart";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";

import { FavoritesView } from "./favorites-view";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), refresh: jest.fn() }),
  usePathname: () => "/es/account/favorites",
}));

jest.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, prefetch, ...props }: { href: string; prefetch?: boolean; children: React.ReactNode }) => (
    <a href={href} data-prefetch={String(prefetch)} {...props}>
      {children}
    </a>
  ),
}));

const CARD = {
  slug: "truper-hammer",
  name: "Martillo",
  short_description: "De carpintero.",
  brand: null,
  image: null,
  price_from: { amount: "5075", currency: "ARS" as const },
  price_varies: false,
  compare_at: null,
  stock_status: "in_stock" as const,
  rating_avg: "0.00",
  rating_count: 0,
};

function serve(page: (requested: number) => object) {
  const requests: URL[] = [];
  server.use(
    http.get(`${ORIGIN}/api/v1/me`, () => HttpResponse.json({ id: 1, role: "customer" })),
    http.get(`${ORIGIN}/api/v1/me/favorites/slugs`, () => HttpResponse.json([CARD.slug])),
    http.get(`${ORIGIN}/api/v1/me/favorites`, ({ request }) => {
      const url = new URL(request.url);
      requests.push(url);
      return HttpResponse.json(page(Number(url.searchParams.get("page"))));
    }),
  );
  return requests;
}

it("shows the favorites as catalog cards in the current currency and language", async () => {
  const requests = serve(() => ({ items: [CARD], page: 1, size: 24, total: 1, pages: 1 }));

  renderWithProviders(<FavoritesView />, { hasSession: true });

  expect(await screen.findByRole("link", { name: "Martillo" })).toHaveAttribute("href", "/products/truper-hammer");
  expect(await screen.findByRole("button", { name: "Marcar Martillo como favorito", pressed: true })).toBeEnabled();
  expect(requests[0].searchParams.get("currency")).toBe("ARS");
  expect(requests[0].searchParams.get("locale")).toBe("es");
});

it("invites a customer without favorites to browse", async () => {
  serve(() => ({ items: [], page: 1, size: 24, total: 0, pages: 0 }));

  renderWithProviders(<FavoritesView />, { hasSession: true });

  expect(await screen.findByText("Todavía no guardaste favoritos")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Ver productos" })).toHaveAttribute("href", "/");
});

it("moves to the last page when the current one no longer exists", async () => {
  const requests = serve((requested) =>
    requested === 1
      ? { items: [CARD], page: 1, size: 24, total: 1, pages: 1 }
      : { items: [], page: requested, size: 24, total: 1, pages: 1 },
  );

  renderWithProviders(<FavoritesView />, { hasSession: true, searchParams: "?page=2" });

  expect(await screen.findByRole("link", { name: "Martillo" })).toBeInTheDocument();
  await waitFor(() => expect(requests.map((url) => url.searchParams.get("page"))).toEqual(["2", "1"]));
});
