import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { CSRF_COOKIE } from "@/lib/api/cookies";
import { ORIGIN } from "@/test/cart";
import { clearCookie, setCookie } from "@/test/cookies";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";

import { OrderView } from "./order-view";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn(), replace: jest.fn() }),
  usePathname: () => "/es/admin/orders",
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  usePathname: () => "/admin/orders",
}));

const NUMBER = "TA-2026-000007";
const URL_ORDER = `${ORIGIN}/api/v1/admin/orders/${NUMBER}`;
const MONEY = { amount: "10150", currency: "ARS" };
const ZERO = { amount: "0", currency: "ARS" };
const ORDER = {
  number: NUMBER,
  status: "paid",
  currency: "ARS",
  exchange_rate: "1450.000000",
  items: [
    {
      variant_id: 30,
      sku: "TRU-WP-6",
      product_name: "Tarugos",
      variant_label: "6 mm",
      quantity: 2,
      unit_price: MONEY,
      line_total: MONEY,
    },
  ],
  subtotal: MONEY,
  discount_total: ZERO,
  shipping_total: ZERO,
  total: MONEY,
  coupon: null,
  delivery: { method: "pickup", address: null, zone: null, pickup_point: null },
  billing: null,
  status_history: [
    { from_status: null, to_status: "pending_payment", note: null, created_at: "2026-10-29T15:00:00Z", changed_by: null },
    { from_status: "pending_payment", to_status: "paid", note: "<b>Revisado</b>", created_at: "2026-10-29T15:01:00Z", changed_by: 9 },
  ],
  payments: [],
  created_at: "2026-10-29T15:00:00Z",
  paid_at: "2026-10-29T15:01:00Z",
  cancelled_at: null,
  locale: "en",
  customer: { id: 4, email: "ana@example.com", first_name: "Ana", last_name: "Diaz" },
  next_statuses: ["preparing", "refunded"],
};

function serve(order: object = ORDER) {
  server.use(http.get(URL_ORDER, () => HttpResponse.json(order)));
}

function serveChange(next: object) {
  const bodies: unknown[] = [];
  server.use(
    http.post(`${URL_ORDER}/status`, async ({ request }) => {
      bodies.push(await request.json());
      return HttpResponse.json(next);
    }),
  );
  return bodies;
}

function renderView() {
  renderWithProviders(<OrderView number={NUMBER} />, { hasSession: true });
  return userEvent.setup();
}

beforeEach(() => setCookie(CSRF_COOKIE, "token"));
afterEach(() => clearCookie(CSRF_COOKIE));

it("shows the order with the customer, the language and who changed it", async () => {
  serve();
  renderView();

  expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(NUMBER);
  expect(screen.getByText("ana@example.com")).toBeInTheDocument();
  expect(screen.getByText("Escribe en inglés")).toBeInTheDocument();
  expect(screen.getByText(/por el usuario #9/)).toBeInTheDocument();
  expect(screen.getByText(/por el sistema/)).toBeInTheDocument();
  expect(screen.getByText("<b>Revisado</b>")).toBeInTheDocument();
  expect(screen.getByText("Cotización congelada al comprar: 1450.000000.")).toBeInTheDocument();
});

it("offers one button per status the backend allows, and nothing else", async () => {
  serve();
  renderView();

  expect(await screen.findByRole("button", { name: "Pasar a preparación" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Reembolsar" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Marcar como enviado" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Marcar como entregado" })).not.toBeInTheDocument();
});

it("says when an order has no more changes", async () => {
  serve({ ...ORDER, status: "delivered", next_statuses: [] });
  renderView();

  expect(await screen.findByText("Este pedido ya no tiene cambios posibles.")).toBeInTheDocument();
  expect(screen.queryByLabelText("Nota interna")).not.toBeInTheDocument();
});

it("moves the order with an internal note and shows the new state", async () => {
  serve();
  const bodies = serveChange({ ...ORDER, status: "preparing", next_statuses: ["ready_for_pickup", "refunded"] });
  const user = renderView();

  await user.type(await screen.findByLabelText("Nota interna"), "  Sale hoy  ");
  await user.click(screen.getByRole("button", { name: "Pasar a preparación" }));

  expect(await screen.findByRole("button", { name: "Marcar listo para retirar" })).toBeInTheDocument();
  expect(bodies).toEqual([{ status: "preparing", note: "Sale hoy" }]);
  expect(screen.getByRole("status")).toHaveTextContent("El pedido pasó a En preparación");
  expect(screen.getByLabelText("Nota interna")).toHaveValue("");
});

it("sends no note when it is empty", async () => {
  serve();
  const bodies = serveChange(ORDER);
  const user = renderView();

  await user.click(await screen.findByRole("button", { name: "Pasar a preparación" }));

  await waitFor(() => expect(bodies).toEqual([{ status: "preparing", note: null }]));
});

it("asks before refunding", async () => {
  serve();
  const bodies = serveChange({ ...ORDER, status: "refunded", next_statuses: [] });
  const user = renderView();

  await user.click(await screen.findByRole("button", { name: "Reembolsar" }));
  const dialog = await screen.findByRole("alertdialog");
  expect(dialog).toHaveTextContent(`¿Reembolsar el pedido ${NUMBER}?`);
  expect(bodies).toEqual([]);
  await user.click(within(dialog).getByRole("button", { name: "Sí, reembolsar" }));

  await waitFor(() => expect(bodies).toEqual([{ status: "refunded", note: null }]));
  expect(await screen.findByText("Este pedido ya no tiene cambios posibles.")).toBeInTheDocument();
});

it("keeps the order as it was when the refund fails", async () => {
  serve();
  server.use(
    http.post(`${URL_ORDER}/status`, () =>
      HttpResponse.json({ code: "payment_unavailable", message: "Down." }, { status: 503 }),
    ),
  );
  const user = renderView();

  await user.click(await screen.findByRole("button", { name: "Reembolsar" }));
  await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Sí, reembolsar" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Los pagos no están disponibles");
  await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  expect(screen.getByRole("button", { name: "Reembolsar" })).toBeInTheDocument();
  expect(screen.getByText("Pagado", { selector: "[data-slot=badge]" })).toBeInTheDocument();
});

it("reloads the order when it changed underneath", async () => {
  serve();
  server.use(
    http.post(`${URL_ORDER}/status`, () => {
      serve({ ...ORDER, status: "cancelled", next_statuses: [] });
      return HttpResponse.json({ code: "invalid_transition", message: "Stale." }, { status: 409 });
    }),
  );
  const user = renderView();

  await user.click(await screen.findByRole("button", { name: "Pasar a preparación" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("El pedido cambió de estado");
  await waitFor(() => expect(screen.queryByRole("button", { name: "Pasar a preparación" })).not.toBeInTheDocument());
});

it("explains an unknown order", async () => {
  server.use(http.get(URL_ORDER, () => HttpResponse.json({ code: "not_found" }, { status: 404 })));
  renderView();

  expect(await screen.findByText("No encontramos ese pedido.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Volver a pedidos" })).toHaveAttribute("href", "/admin/orders");
});
