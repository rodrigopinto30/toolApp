import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import type { Order } from "@/features/orders/types";
import { CSRF_COOKIE } from "@/lib/api/cookies";
import { ORIGIN } from "@/test/cart";
import { clearCookie, setCookie } from "@/test/cookies";
import { server } from "@/test/msw/server";
import { orderOf } from "@/test/orders";
import { renderWithProviders } from "@/test/render";

import { OrderView } from "./order-view";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), refresh: jest.fn() }),
  usePathname: () => "/es/account/orders/TA-2026-000001",
}));

jest.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const ME = { id: 1, email: "ana@example.com", first_name: "Ana", last_name: "Diaz", email_verified: true };
const NUMBER = "TA-2026-000001";
const DETAIL = `${ORIGIN}/api/v1/me/orders/${NUMBER}`;
const PENDING_PAYMENT: Order["payments"][number] = {
  status: "pending",
  amount: { amount: "10150", currency: "ARS" },
  brand: null,
  last4: null,
  created_at: "2026-10-29T15:00:01Z",
};
const PENDING = orderOf({
  status: "pending_payment",
  paid_at: null,
  payments: [{ status: "pending", amount: { amount: "10150", currency: "ARS" }, brand: null, last4: null, created_at: "2026-10-29T15:00:01Z" }],
});

let keys: (string | null)[] = [];

function serveOrder(order: Order) {
  server.use(http.get(DETAIL, () => HttpResponse.json(order)));
}

function answerPay(...answers: (() => Response)[]) {
  server.use(
    http.post(`${DETAIL}/pay`, ({ request }) => {
      keys.push(request.headers.get("Idempotency-Key"));
      return (answers.shift() ?? answers.at(-1)!)();
    }),
  );
}

beforeEach(() => {
  keys = [];
  setCookie(CSRF_COOKIE, "token");
  server.use(http.get(`${ORIGIN}/api/v1/me`, () => HttpResponse.json(ME)));
});

afterEach(() => clearCookie(CSRF_COOKIE));

function renderOrder(searchParams = "") {
  renderWithProviders(<OrderView number={NUMBER} />, { hasSession: true, searchParams });
  return userEvent.setup();
}

async function retryPayment(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText("Número de tarjeta"), "4242424242424242");
  await user.type(screen.getByLabelText("Vencimiento (MM/AA)"), "1230");
  await user.type(screen.getByLabelText("Código de seguridad"), "123");
  await user.type(screen.getByLabelText("Nombre como figura en la tarjeta"), "Ana Diaz");
  await user.click(screen.getByRole("button", { name: /^Pagar \$/ }));
}

it("confirms a paid order after the checkout and shows its details", async () => {
  serveOrder(orderOf());

  renderOrder("?placed=1");

  expect(await screen.findByText(/¡Gracias por tu compra!/)).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 1, name: `Pedido ${NUMBER}` })).toBeInTheDocument();
  expect(screen.getByText("Pagado", { selector: "[data-slot=badge]" })).toBeInTheDocument();
  expect(within(screen.getByRole("region", { name: "Productos" })).getByText(/Tarugos de nylon/)).toBeInTheDocument();
  expect(within(screen.getByRole("region", { name: "Entrega" })).getByText("ToolApp Store")).toBeInTheDocument();
  expect(within(screen.getByRole("region", { name: "Facturación" })).getByText("Consumidor final")).toBeInTheDocument();
  expect(within(screen.getByRole("region", { name: "Pagos" })).getByText(/visa terminada en 4242/)).toBeInTheDocument();
  expect(within(screen.getByRole("region", { name: "Seguimiento" })).getAllByRole("listitem")).toHaveLength(2);
});

it("says so when the order does not exist or belongs to someone else", async () => {
  server.use(http.get(DETAIL, () => HttpResponse.json({ code: "not_found", message: "Order not found." }, { status: 404 })));

  renderOrder();

  expect(await screen.findByText("No encontramos ese pedido.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Volver a mis pedidos" })).toHaveAttribute("href", "/account/orders");
});

it("cancels a paid order after warning about the refund", async () => {
  serveOrder(orderOf());
  const cancelled = orderOf({ status: "cancelled", cancelled_at: "2026-10-29T16:00:00Z" });
  server.use(http.post(`${DETAIL}/cancel`, () => HttpResponse.json(cancelled)));
  const user = renderOrder();

  await user.click(await screen.findByRole("button", { name: "Cancelar el pedido" }));
  const dialog = await screen.findByRole("alertdialog", { name: `¿Cancelar el pedido ${NUMBER}?` });
  expect(within(dialog).getByText(/Te reintegramos \$\s?10\.150 en el mismo medio de pago\./)).toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "Sí, cancelar" }));

  expect(await screen.findByText("Cancelado", { selector: "[data-slot=badge]" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Cancelar el pedido" })).not.toBeInTheDocument();
});

it("offers no actions on an order that can no longer change", async () => {
  serveOrder(orderOf({ status: "delivered" }));

  renderOrder();

  expect(await screen.findByText("Entregado", { selector: "[data-slot=badge]" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Cancelar el pedido" })).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Número de tarjeta")).not.toBeInTheDocument();
});

it("explains why an unpaid order expired and offers no way to pay it", async () => {
  serveOrder(
    orderOf({
      status: "cancelled",
      status_history: [
        { from_status: null, to_status: "pending_payment", note: null, created_at: "2026-10-29T15:00:00Z" },
        { from_status: "pending_payment", to_status: "cancelled", note: "expired", created_at: "2026-10-29T15:30:00Z" },
      ],
      payments: [PENDING_PAYMENT],
    }),
  );

  renderOrder();

  expect(await screen.findByText(/Venció porque el pago no llegó a tiempo\./)).toBeInTheDocument();
  expect(screen.queryByLabelText("Número de tarjeta")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Cancelar el pedido" })).not.toBeInTheDocument();
  expect(screen.getByText("No completado")).toBeInTheDocument();
  expect(screen.queryByText("Pendiente")).not.toBeInTheDocument();
});

it("keeps calling a payment pending while the order waits for it", async () => {
  serveOrder(orderOf({ status: "pending_payment", payments: [PENDING_PAYMENT] }));

  renderOrder();

  expect(await screen.findByText("Pendiente")).toBeInTheDocument();
  expect(screen.queryByText("No completado")).not.toBeInTheDocument();
});

it("retries the payment of a pending order", async () => {
  serveOrder(PENDING);
  answerPay(() => HttpResponse.json(orderOf()));
  const user = renderOrder("?placed=1");

  expect(await screen.findByText(/el pago quedó pendiente/)).toBeInTheDocument();
  await retryPayment(user);

  expect(await screen.findByText("Recibimos el pago. ¡Gracias por tu compra!")).toBeInTheDocument();
  expect(screen.getByText("Pagado", { selector: "[data-slot=badge]" })).toBeInTheDocument();
  expect(screen.queryByLabelText("Número de tarjeta")).not.toBeInTheDocument();
  expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
});

it("says the payment is still pending and clears the card", async () => {
  serveOrder(PENDING);
  answerPay(() => HttpResponse.json(PENDING, { status: 202 }));
  const user = renderOrder();

  await retryPayment(user);

  expect(await screen.findByText("El pago sigue pendiente. Probá de nuevo en unos minutos.")).toBeInTheDocument();
  expect(screen.getByLabelText("Número de tarjeta")).toHaveValue("");
});

it("explains a rejected retry and points to the refilled cart", async () => {
  serveOrder(PENDING);
  answerPay(() => {
    serveOrder(orderOf({ status: "cancelled" }));
    return HttpResponse.json(
      { code: "payment_rejected", message: "The payment was rejected.", details: { order_number: NUMBER } },
      { status: 402 },
    );
  });
  const user = renderOrder();

  await retryPayment(user);

  expect(await screen.findByText(/La tarjeta fue rechazada y cancelamos el pedido/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Ir al carrito" })).toHaveAttribute("href", "/cart");
  await waitFor(() => expect(screen.queryByLabelText("Número de tarjeta")).not.toBeInTheDocument());
});

it("keeps the key to retry a lost request", async () => {
  serveOrder(PENDING);
  answerPay(() => HttpResponse.error(), () => HttpResponse.json(orderOf()));
  const user = renderOrder();

  await retryPayment(user);
  expect(await screen.findByText("No hay conexión. Revisá tu red.")).toBeInTheDocument();
  await retryPayment(user);

  expect(await screen.findByText("Recibimos el pago. ¡Gracias por tu compra!")).toBeInTheDocument();
  expect(keys[0]).toBe(keys[1]);
});
