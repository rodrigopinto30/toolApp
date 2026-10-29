import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import type { ShippingQuoteRequest } from "@/features/catalog/types";
import type { Variant } from "@/features/catalog/variants";
import { CSRF_COOKIE } from "@/lib/api/cookies";
import { clearCookie, setCookie } from "@/test/cookies";
import { server } from "@/test/msw/server";
import { renderWithUrl } from "@/test/render";

import { ProductShippingQuote } from "./shipping-quote";
import { VariantSelector } from "./variant-selector";

const ORIGIN = "https://localhost";
const PROVINCES = [
  { code: "AR-B", name: "Buenos Aires" },
  { code: "AR-X", name: "Córdoba" },
];
const VARIANTS: Variant[] = ["6mm", "8mm"].map((size, index) => ({
  id: index + 1,
  sku: `WP-${size}`,
  price: { amount: "5075", currency: "ARS" },
  compare_at: null,
  stock_status: "in_stock",
  attributes: [{ code: "size", name: "Medida", value_slug: size, value: size }],
}));
const PICKUP_POINT = {
  id: 1,
  name: "ToolApp Store",
  address: "Av. Corrientes 1234",
  hours: { mon_fri: "09:00-18:00", sat: "09:00-13:00" },
};

let requests: ShippingQuoteRequest[] = [];

beforeEach(() => {
  requests = [];
  setCookie(CSRF_COOKIE, "token");
  server.use(
    http.post(`${ORIGIN}/api/v1/shipping/quote`, async ({ request }) => {
      const body = (await request.json()) as ShippingQuoteRequest;
      requests.push(body);
      const pickup = body.delivery_method === "pickup";
      return HttpResponse.json({
        delivery_method: body.delivery_method,
        subtotal: { amount: "10150", currency: "ARS" },
        cost: { amount: pickup ? "0" : "17400", currency: "ARS" },
        is_free: pickup,
        eta_min_days: pickup ? 0 : 3,
        eta_max_days: pickup ? 0 : 5,
        zone: null,
        pickup_points: pickup ? [PICKUP_POINT] : [],
      });
    }),
  );
});

afterEach(() => clearCookie(CSRF_COOKIE));

function renderQuote() {
  renderWithUrl(
    <>
      <VariantSelector variants={VARIANTS} />
      <ProductShippingQuote variants={VARIANTS} provinces={PROVINCES} />
    </>,
  );
  return userEvent.setup();
}

it("quotes home delivery for the province, the quantity and the chosen variant", async () => {
  const user = renderQuote();

  await user.click(screen.getByRole("combobox", { name: "Provincia" }));
  await user.click(await screen.findByRole("option", { name: "Córdoba" }));
  await user.clear(screen.getByRole("spinbutton", { name: "Cantidad" }));
  await user.type(screen.getByRole("spinbutton", { name: "Cantidad" }), "2");
  await user.click(screen.getByRole("button", { name: "Calcular" }));

  expect(await screen.findByText(/^Envío: \$\s?17\.400$/)).toBeInTheDocument();
  expect(screen.getByText("Llega en 3 a 5 días hábiles.")).toBeInTheDocument();
  expect(requests).toEqual([
    { delivery_method: "shipping", province_code: "AR-X", items: [{ variant_id: 1, quantity: 2 }], currency: "ARS" },
  ]);
});

it("asks for a province and a valid quantity before calling the API", async () => {
  const user = renderQuote();

  await user.clear(screen.getByRole("spinbutton", { name: "Cantidad" }));
  await user.type(screen.getByRole("spinbutton", { name: "Cantidad" }), "120");
  await user.click(screen.getByRole("button", { name: "Calcular" }));

  expect(await screen.findByText("Completá este campo.")).toBeInTheDocument();
  expect(screen.getByRole("spinbutton", { name: "Cantidad" })).toHaveAccessibleDescription(
    "Ingresá una cantidad entre 1 y 99.",
  );
  expect(requests).toEqual([]);
});

it("lists the pickup points with their opening hours", async () => {
  const user = renderQuote();

  await user.click(screen.getByRole("radio", { name: "Retiro en el local" }));
  expect(screen.queryByRole("combobox", { name: "Provincia" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Calcular" }));

  expect(await screen.findByText("ToolApp Store")).toBeInTheDocument();
  expect(screen.getByText("Lunes a viernes: 09:00-18:00")).toBeInTheDocument();
  expect(requests[0]).toMatchObject({ delivery_method: "pickup", province_code: null });
});

it("quotes again for the new variant once a quote is shown", async () => {
  const user = renderQuote();

  await user.click(screen.getByRole("radio", { name: "Retiro en el local" }));
  await user.click(screen.getByRole("button", { name: "Calcular" }));
  await screen.findByText("ToolApp Store");
  await user.click(screen.getByRole("radio", { name: "8mm" }));

  await waitFor(() => expect(requests).toHaveLength(2));
  expect(requests[1]).toMatchObject({ delivery_method: "pickup", items: [{ variant_id: 2, quantity: 1 }] });
});
