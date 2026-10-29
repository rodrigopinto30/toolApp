import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import type { Variant } from "@/features/catalog/variants";
import { CSRF_COOKIE } from "@/lib/api/cookies";
import { cartLine, cartOf, ORIGIN, storedGuestItems } from "@/test/cart";
import { clearCookie, setCookie } from "@/test/cookies";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";

import { AddToCart } from "./add-to-cart";

jest.mock("next/navigation", () => ({ useRouter: () => ({ replace: jest.fn(), refresh: jest.fn() }) }));

jest.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

const VARIANTS: Variant[] = [
  { id: 30, sku: "TRU-WP-6", stock: "in_stock" },
  { id: 31, sku: "TRU-WP-8", stock: "out_of_stock" },
].map(({ id, sku, stock }) => ({
  id,
  sku,
  price: { amount: "5075", currency: "ARS" },
  compare_at: null,
  stock_status: stock as Variant["stock_status"],
  attributes: [],
}));

beforeEach(() => {
  localStorage.clear();
  setCookie(CSRF_COOKIE, "token");
});

afterEach(() => clearCookie(CSRF_COOKIE));

async function addUnits(units: number) {
  const user = userEvent.setup();
  const quantity = screen.getByRole("spinbutton", { name: "Cantidad" });
  await user.clear(quantity);
  await user.type(quantity, String(units));
  await user.click(screen.getByRole("button", { name: "Agregar al carrito" }));
}

it("adds the selected variant to the guest cart, adding to the units already there", async () => {
  renderWithProviders(<AddToCart variants={VARIANTS} />, { searchParams: "?variant=TRU-WP-6" });

  await addUnits(2);
  expect(await screen.findByText("Agregado al carrito.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Ver carrito" })).toHaveAttribute("href", "/cart");
  await addUnits(3);

  await waitFor(() => expect(storedGuestItems()).toEqual([{ variantId: 30, quantity: 5 }]));
});

it("does not sell a variant without stock", () => {
  renderWithProviders(<AddToCart variants={VARIANTS} />, { searchParams: "?variant=TRU-WP-8" });

  expect(screen.getByRole("button", { name: "Agregar al carrito" })).toBeDisabled();
  expect(screen.getByText("Esta variante no tiene stock.")).toBeInTheDocument();
});

it("sets the customer's line to the current units plus the new ones", async () => {
  const puts: unknown[] = [];
  server.use(
    http.get(`${ORIGIN}/api/v1/me/cart`, () => HttpResponse.json(cartOf([cartLine({ quantity: 2 })]))),
    http.put(`${ORIGIN}/api/v1/me/cart/items/30`, async ({ request }) => {
      puts.push(await request.json());
      return HttpResponse.json(cartOf([cartLine({ quantity: 5 })]));
    }),
  );
  renderWithProviders(<AddToCart variants={VARIANTS} />, { hasSession: true, searchParams: "?variant=TRU-WP-6" });

  await addUnits(3);

  expect(await screen.findByText("Agregado al carrito.")).toBeInTheDocument();
  expect(puts).toEqual([{ quantity: 5 }]);
});

it("explains how many units are left when the stock is short", async () => {
  server.use(
    http.get(`${ORIGIN}/api/v1/me/cart`, () => HttpResponse.json(cartOf([]))),
    http.put(`${ORIGIN}/api/v1/me/cart/items/30`, () =>
      HttpResponse.json(
        { code: "insufficient_stock", message: "There is not enough stock.", details: { available: 4 } },
        { status: 409 },
      ),
    ),
  );
  renderWithProviders(<AddToCart variants={VARIANTS} />, { hasSession: true, searchParams: "?variant=TRU-WP-6" });

  await addUnits(9);

  expect(await screen.findByText("No hay stock suficiente: quedan 4 unidades.")).toBeInTheDocument();
});
