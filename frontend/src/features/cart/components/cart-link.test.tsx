import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";

import { cartLine, cartOf, ORIGIN, storeGuestCart } from "@/test/cart";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";

import { CartLink } from "./cart-link";

jest.mock("next/navigation", () => ({ useRouter: () => ({ replace: jest.fn(), refresh: jest.fn() }) }));

jest.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

beforeEach(() => localStorage.clear());

it("counts the guest's units from the browser without calling the API", async () => {
  storeGuestCart([
    { variantId: 30, quantity: 2 },
    { variantId: 11, quantity: 1 },
  ]);

  renderWithProviders(<CartLink />);

  expect(await screen.findByRole("link", { name: "Carrito, 3 unidades" })).toHaveAttribute("href", "/cart");
});

it("counts the customer's units from the server cart", async () => {
  server.use(http.get(`${ORIGIN}/api/v1/me/cart`, () => HttpResponse.json(cartOf([cartLine({ quantity: 4 })]))));

  renderWithProviders(<CartLink />, { hasSession: true });

  expect(await screen.findByRole("link", { name: "Carrito, 4 unidades" })).toBeInTheDocument();
});

it("says the cart is empty", async () => {
  renderWithProviders(<CartLink />);

  expect(await screen.findByRole("link", { name: "Carrito, vacío" })).toBeInTheDocument();
});
