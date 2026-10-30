import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";

import { ORIGIN } from "@/test/cart";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";

import { OrdersView } from "./orders-view";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), refresh: jest.fn() }),
  usePathname: () => "/es/account/orders",
}));

jest.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const ME = { id: 1, email: "ana@example.com", first_name: "Ana", last_name: "Diaz", email_verified: true };

function serveOrders(page: object, onRequest?: (url: URL) => void) {
  server.use(
    http.get(`${ORIGIN}/api/v1/me`, () => HttpResponse.json(ME)),
    http.get(`${ORIGIN}/api/v1/me/orders`, ({ request }) => {
      onRequest?.(new URL(request.url));
      return HttpResponse.json(page);
    }),
  );
}

it("lists the orders with their status, units and total", async () => {
  serveOrders({
    items: [
      {
        number: "TA-2026-000002",
        status: "pending_payment",
        total: { amount: "10150", currency: "ARS" },
        item_count: 3,
        created_at: "2026-10-29T15:00:00Z",
      },
    ],
    page: 1,
    size: 10,
    total: 1,
    pages: 1,
  });

  renderWithProviders(<OrdersView />, { hasSession: true });

  const link = await screen.findByRole("link", { name: /Pedido TA-2026-000002 del 29 oct/ });
  expect(link).toHaveAttribute("href", "/account/orders/TA-2026-000002");
  expect(link).toHaveTextContent("3 unidades");
  expect(link).toHaveTextContent("Pago pendiente");
  expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
});

it("asks the API for the page in the URL and links the others", async () => {
  let page: string | null = null;
  serveOrders(
    {
      items: [
        {
          number: "TA-2026-000001",
          status: "paid",
          total: { amount: "1", currency: "USD" },
          item_count: 1,
          created_at: "2026-10-29T15:00:00Z",
        },
      ],
      page: 2,
      size: 10,
      total: 11,
      pages: 2,
    },
    (url) => {
      page = url.searchParams.get("page");
    },
  );

  renderWithProviders(<OrdersView />, { hasSession: true, searchParams: "?page=2" });

  expect(await screen.findByRole("link", { name: "Anterior" })).toHaveAttribute("href", "/account/orders");
  expect(page).toBe("2");
});

it("invites a new customer to shop", async () => {
  serveOrders({ items: [], page: 1, size: 10, total: 0, pages: 0 });

  renderWithProviders(<OrdersView />, { hasSession: true });

  expect(await screen.findByText("Todavía no hiciste ningún pedido")).toBeInTheDocument();
});
