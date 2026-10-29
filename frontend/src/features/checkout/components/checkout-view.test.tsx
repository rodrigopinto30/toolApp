import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import type { CheckoutPreview, CheckoutPreviewRequest } from "@/features/checkout/types";
import { CSRF_COOKIE } from "@/lib/api/cookies";
import { cartLine, cartOf, ORIGIN } from "@/test/cart";
import { clearCookie, setCookie } from "@/test/cookies";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";

import { CheckoutView } from "./checkout-view";

const replace = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), refresh: jest.fn() }),
  usePathname: () => "/es/checkout",
}));

jest.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  useRouter: () => ({ replace }),
}));

const PROVINCES = [{ code: "AR-C", name: "Ciudad Autónoma de Buenos Aires" }];
const PICKUP_POINTS = [{ id: 1, name: "ToolApp Store", address: "Av. Corrientes 1234", hours: null }];
const ME = { id: 1, email: "ana@example.com", first_name: "Ana", last_name: "Diaz", phone: null, role: "customer" };

let previews: CheckoutPreviewRequest[] = [];
let checkouts: { key: string | null; body: Record<string, unknown> }[] = [];

function preview(request: CheckoutPreviewRequest, total = "10150"): CheckoutPreview {
  const discount = request.coupon_code ? "1015" : "0";
  return {
    items: [cartLine()],
    item_count: 2,
    subtotal: { amount: "10150", currency: "ARS" },
    discount_total: { amount: discount, currency: "ARS" },
    shipping_total: { amount: "0", currency: "ARS" },
    total: { amount: request.coupon_code ? "9135" : total, currency: "ARS" },
    coupon: request.coupon_code ? { code: request.coupon_code, type: "percent" } : null,
    delivery: {
      method: request.delivery_method,
      is_free: true,
      eta_min_days: 0,
      eta_max_days: 0,
      zone: null,
      pickup_point: { ...PICKUP_POINTS[0] },
    },
    exchange_rate: "1450.000000",
    currency: "ARS",
  };
}

function answerCheckout(...answers: (() => Response)[]) {
  server.use(
    http.post(`${ORIGIN}/api/v1/checkout`, async ({ request }) => {
      checkouts.push({
        key: request.headers.get("Idempotency-Key"),
        body: (await request.json()) as Record<string, unknown>,
      });
      return (answers.shift() ?? answers.at(-1)!)();
    }),
  );
}

const PAID = () => HttpResponse.json({ number: "TA-2026-000001", status: "paid" }, { status: 201 });

beforeEach(() => {
  previews = [];
  checkouts = [];
  replace.mockClear();
  setCookie(CSRF_COOKIE, "token");
  server.use(
    http.get(`${ORIGIN}/api/v1/me`, () => HttpResponse.json({ ...ME, email_verified: true })),
    http.get(`${ORIGIN}/api/v1/me/cart`, () => HttpResponse.json(cartOf([cartLine()]))),
    http.get(`${ORIGIN}/api/v1/me/addresses`, () => HttpResponse.json([])),
    http.get(`${ORIGIN}/api/v1/me/billing-profiles`, () => HttpResponse.json([])),
    http.post(`${ORIGIN}/api/v1/checkout/preview`, async ({ request }) => {
      const body = (await request.json()) as CheckoutPreviewRequest;
      previews.push(body);
      if (body.coupon_code === "NOPE") {
        return HttpResponse.json({ code: "coupon_not_found", message: "The coupon does not exist." }, { status: 422 });
      }
      return HttpResponse.json(preview(body));
    }),
  );
});

afterEach(() => clearCookie(CSRF_COOKIE));

function renderCheckout() {
  renderWithProviders(<CheckoutView provinces={PROVINCES} pickupPoints={PICKUP_POINTS} />, { hasSession: true });
  return userEvent.setup();
}

async function choosePickup(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByText("Retiro en el local"));
  await screen.findByRole("button", { name: /^Pagar \$/ });
}

async function pay(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Número de tarjeta"), "4242424242424242");
  await user.type(screen.getByLabelText("Vencimiento (MM/AA)"), "1230");
  await user.type(screen.getByLabelText("Código de seguridad"), "123");
  await user.type(screen.getByLabelText("Nombre como figura en la tarjeta"), "Ana Diaz");
  await user.click(screen.getByRole("button", { name: /^Pagar \$/ }));
}

it("asks an unverified customer to confirm the email first", async () => {
  server.use(http.get(`${ORIGIN}/api/v1/me`, () => HttpResponse.json({ ...ME, email_verified: false })));

  renderCheckout();

  expect(await screen.findByText("Para comprar necesitás confirmar tu email.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Reenviar el link" })).toBeInTheDocument();
});

it("sends the customer back to an empty cart", async () => {
  server.use(http.get(`${ORIGIN}/api/v1/me/cart`, () => HttpResponse.json(cartOf([]))));

  renderCheckout();

  expect(await screen.findByText("Tu carrito está vacío.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Volver al carrito" })).toHaveAttribute("href", "/cart");
});

it("previews a pickup order and pays it with an idempotency key", async () => {
  answerCheckout(PAID);
  const user = renderCheckout();

  await choosePickup(user);
  expect(previews.at(-1)).toEqual({
    delivery_method: "pickup",
    pickup_point_id: 1,
    billing_profile_id: null,
    currency: "ARS",
    coupon_code: null,
  });
  const summary = screen.getByRole("region", { name: "Tu pedido" });
  expect(within(summary).getByText("Retirás en ToolApp Store.")).toBeInTheDocument();
  await pay(user);

  await waitFor(() => expect(replace).toHaveBeenCalledWith("/account/orders/TA-2026-000001?placed=1"));
  const [{ key, body }] = checkouts;
  expect(key).toMatch(/^[0-9a-f-]{36}$/);
  expect(body).toMatchObject({
    delivery_method: "pickup",
    pickup_point_id: 1,
    expected_total: { amount: "10150", currency: "ARS" },
    payment: { card_number: "4242 4242 4242 4242", expiry: "12/30", cvc: "123", holder: "Ana Diaz" },
  });
  expect(screen.getByText("¡Listo! Te llevamos a tu pedido…")).toBeInTheDocument();
});

it("validates a coupon before adding it to the preview", async () => {
  const user = renderCheckout();
  await choosePickup(user);
  const code = screen.getByLabelText("Código");

  await user.type(code, "nope");
  await user.click(screen.getByRole("button", { name: "Aplicar" }));
  expect(await screen.findByText("Ese cupón no existe.")).toBeInTheDocument();
  await user.clear(code);
  await user.type(code, "bienvenida10");
  await user.click(screen.getByRole("button", { name: "Aplicar" }));

  expect(await screen.findByText("Cupón BIENVENIDA10 aplicado.")).toBeInTheDocument();
  expect(await screen.findByText("Descuento (BIENVENIDA10)")).toBeInTheDocument();
  expect(previews.at(-1)?.coupon_code).toBe("BIENVENIDA10");
});

it("keeps a rejected customer on the page with the order number and an empty card", async () => {
  answerCheckout(() =>
    HttpResponse.json(
      { code: "payment_rejected", message: "The payment was rejected.", details: { order_number: "TA-2026-000002" } },
      { status: 402 },
    ),
  );
  const user = renderCheckout();
  await choosePickup(user);

  await pay(user);

  expect(await screen.findByText(/Tu tarjeta fue rechazada y cancelamos el pedido TA-2026-000002/)).toBeInTheDocument();
  expect(screen.getByLabelText("Número de tarjeta")).toHaveValue("");
  expect(screen.getByLabelText("Nombre como figura en la tarjeta")).toHaveValue("Ana Diaz");
  expect(replace).not.toHaveBeenCalled();
});

it("shows a changed total and confirms it with a new key", async () => {
  answerCheckout(
    () =>
      HttpResponse.json(
        {
          code: "total_changed",
          message: "The total changed since the preview.",
          details: { preview: preview({ delivery_method: "pickup", currency: "ARS" }, "10500") },
        },
        { status: 409 },
      ),
    PAID,
  );
  const user = renderCheckout();
  await choosePickup(user);

  await pay(user);
  expect(await screen.findByText("El total cambió desde que lo viste. Revisalo y confirmá de nuevo.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^Pagar \$\s?10\.500$/ })).toBeInTheDocument();
  await pay(user);

  await waitFor(() => expect(replace).toHaveBeenCalled());
  expect(checkouts.map((attempt) => attempt.body.expected_total)).toEqual([
    { amount: "10150", currency: "ARS" },
    { amount: "10500", currency: "ARS" },
  ]);
  expect(checkouts[0].key).not.toBe(checkouts[1].key);
});

it("retries a lost request with the same key", async () => {
  answerCheckout(() => HttpResponse.error(), PAID);
  const user = renderCheckout();
  await choosePickup(user);

  await pay(user);
  expect(await screen.findByText("No hay conexión. Revisá tu red.")).toBeInTheDocument();
  await pay(user);

  await waitFor(() => expect(replace).toHaveBeenCalled());
  expect(checkouts[0].key).toBe(checkouts[1].key);
});
