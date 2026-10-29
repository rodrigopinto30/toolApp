import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import type { LineItem } from "@/features/cart/types";
import { CSRF_COOKIE } from "@/lib/api/cookies";
import { cartLine, cartOf, ORIGIN, storedGuestItems, storeGuestCart } from "@/test/cart";
import { clearCookie, setCookie } from "@/test/cookies";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";

import { CartView } from "./cart-view";

jest.mock("next/navigation", () => ({ useRouter: () => ({ replace: jest.fn(), refresh: jest.fn() }) }));

jest.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string | { pathname: string; query: Record<string, string> };
    children: React.ReactNode;
  }) => (
    <a href={typeof href === "string" ? href : `${href.pathname}?${new URLSearchParams(href.query)}`} {...props}>
      {children}
    </a>
  ),
}));

const PROVINCES = [{ code: "AR-C", name: "CABA" }];
const SCREWDRIVERS = cartLine({
  variant_id: 11,
  sku: "STA-SD6",
  product_slug: "stanley-screwdriver-set-6",
  product_name: "Juego de destornilladores 6 piezas",
  variant_label: null,
  quantity: 3,
  unit_price: { amount: "28855", currency: "ARS" },
  line_total: { amount: "86565", currency: "ARS" },
});

let quotes: LineItem[][] = [];

function quoteFrom(items: LineItem[]) {
  return cartOf(
    items.flatMap(({ variant_id, quantity }) => {
      if (variant_id === 30) {
        return [cartLine({ quantity, issue: quantity > 4 ? "insufficient_stock" : null, available: quantity > 4 ? 4 : null })];
      }
      return variant_id === 11 ? [{ ...SCREWDRIVERS, quantity }] : [];
    }),
  );
}

beforeEach(() => {
  quotes = [];
  localStorage.clear();
  setCookie(CSRF_COOKIE, "token");
  server.use(
    http.post(`${ORIGIN}/api/v1/cart/quote`, async ({ request }) => {
      const { items } = (await request.json()) as { items: LineItem[] };
      quotes.push(items);
      return HttpResponse.json(quoteFrom(items));
    }),
  );
});

afterEach(() => clearCookie(CSRF_COOKIE));

it("prices the guest cart through the API and drops variants it does not know", async () => {
  storeGuestCart([
    { variantId: 30, quantity: 2 },
    { variantId: 999, quantity: 1 },
  ]);

  renderWithProviders(<CartView provinces={PROVINCES} />);

  const line = (await screen.findByRole("link", { name: "Tarugos de nylon (100 u.)" })).closest("li")!;
  expect(line).toHaveAttribute("aria-busy", "false");
  expect(within(line).getByText("6 mm")).toBeInTheDocument();
  expect(within(line).getByText(/^\$\s?5\.075 c\/u$/)).toBeInTheDocument();
  expect(within(line).getByRole("link")).toHaveAttribute(
    "href",
    "/products/truper-nylon-wall-plugs-100?variant=TRU-WP-6",
  );
  expect(quotes[0]).toEqual([
    { variant_id: 30, quantity: 2 },
    { variant_id: 999, quantity: 1 },
  ]);
  await waitFor(() => expect(storedGuestItems()).toEqual([{ variantId: 30, quantity: 2 }]));
});

it("shows stock issues and fixes the quantity with one click", async () => {
  storeGuestCart([{ variantId: 30, quantity: 9 }]);
  const user = userEvent.setup();
  renderWithProviders(<CartView provinces={PROVINCES} />);

  expect(await screen.findByText("Solo quedan 4 unidades.")).toBeInTheDocument();
  expect(screen.getByText("Resolvé los productos marcados para poder pagar.")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Dejar 4 unidades" }));

  await waitFor(() => expect(screen.queryByText("Solo quedan 4 unidades.")).not.toBeInTheDocument());
  expect(storedGuestItems()).toEqual([{ variantId: 30, quantity: 4 }]);
});

it("changes and removes lines until the cart is empty", async () => {
  storeGuestCart([
    { variantId: 30, quantity: 2 },
    { variantId: 11, quantity: 3 },
  ]);
  const user = userEvent.setup();
  renderWithProviders(<CartView provinces={PROVINCES} />);

  await user.click(
    within((await screen.findByRole("link", { name: SCREWDRIVERS.product_name })).closest("li")!).getByRole("button", {
      name: "Sumar una unidad",
    }),
  );
  await waitFor(() => expect(quotes.at(-1)).toContainEqual({ variant_id: 11, quantity: 4 }));
  await user.click(screen.getByRole("button", { name: `Quitar ${SCREWDRIVERS.product_name}` }));
  await user.click(screen.getByRole("button", { name: "Quitar Tarugos de nylon (100 u.)" }));

  expect(await screen.findByRole("heading", { name: "Tu carrito está vacío" })).toBeInTheDocument();
  expect(storedGuestItems()).toEqual([]);
});

it("sends a guest to log in before paying", async () => {
  storeGuestCart([{ variantId: 30, quantity: 2 }]);

  renderWithProviders(<CartView provinces={PROVINCES} />);

  expect(await screen.findByRole("link", { name: "Ingresá para pagar" })).toHaveAttribute(
    "href",
    "/login?next=%2Fes%2Fcheckout",
  );
});

it("blocks the customer's checkout while a line has an issue", async () => {
  server.use(
    http.get(`${ORIGIN}/api/v1/me/cart`, () =>
      HttpResponse.json(cartOf([cartLine({ issue: "unavailable" }), SCREWDRIVERS], "86565")),
    ),
  );

  renderWithProviders(<CartView provinces={PROVINCES} />, { hasSession: true });

  expect(await screen.findByText("Ya no está disponible. Quitalo para seguir.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Ir a pagar" })).toBeDisabled();
  expect(within(screen.getByRole("region", { name: "Resumen" })).getByText(/^\$\s?86\.565$/)).toBeInTheDocument();
});

it("shows the empty state for an empty guest cart without calling the API", async () => {
  renderWithProviders(<CartView provinces={PROVINCES} />);

  expect(await screen.findByRole("heading", { name: "Tu carrito está vacío" })).toBeInTheDocument();
  expect(quotes).toEqual([]);
});
