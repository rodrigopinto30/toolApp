import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { CSRF_COOKIE } from "@/lib/api/cookies";
import { ORIGIN } from "@/test/cart";
import { clearCookie, setCookie } from "@/test/cookies";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";

import { AddressForm } from "./address-form";

jest.mock("next/navigation", () => ({ useRouter: () => ({ replace: jest.fn(), refresh: jest.fn() }) }));

const PROVINCES = [
  { code: "AR-C", name: "Ciudad Autónoma de Buenos Aires" },
  { code: "AR-X", name: "Córdoba" },
];

beforeEach(() => setCookie(CSRF_COOKIE, "token"));
afterEach(() => clearCookie(CSRF_COOKIE));

it("checks the fields before calling the API", async () => {
  const user = userEvent.setup();
  renderWithProviders(<AddressForm provinces={PROVINCES} onCreated={jest.fn()} />);

  await user.type(screen.getByLabelText("Código postal"), "12");
  await user.click(screen.getByRole("button", { name: "Guardar la dirección" }));

  expect(await screen.findAllByText("Completá este campo.")).toHaveLength(7);
  expect(screen.getByText("Usá entre 4 y 10 letras o números.")).toBeInTheDocument();
});

it("creates the address and hands it back", async () => {
  let body: unknown;
  server.use(
    http.post(`${ORIGIN}/api/v1/me/addresses`, async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({ id: 7, ...(body as object), province: PROVINCES[0] }, { status: 201 });
    }),
  );
  const onCreated = jest.fn();
  const user = userEvent.setup();
  renderWithProviders(<AddressForm provinces={PROVINCES} onCreated={onCreated} />);

  await user.type(screen.getByLabelText("Nombre de la dirección"), "Casa");
  await user.type(screen.getByLabelText("Quién recibe"), "Ana Diaz");
  await user.type(screen.getByLabelText("Teléfono"), "11 5555-5555");
  await user.type(screen.getByLabelText("Calle"), "Av. Corrientes");
  await user.type(screen.getByLabelText("Número"), "1234");
  await user.type(screen.getByLabelText("Ciudad"), "CABA");
  await user.click(screen.getByRole("combobox", { name: "Provincia" }));
  await user.click(await screen.findByRole("option", { name: PROVINCES[0].name }));
  await user.type(screen.getByLabelText("Código postal"), "C1043");
  await user.click(screen.getByRole("button", { name: "Guardar la dirección" }));

  await screen.findByRole("button", { name: "Guardar la dirección" });
  expect(body).toEqual({
    label: "Casa",
    recipient_name: "Ana Diaz",
    phone: "11 5555-5555",
    street: "Av. Corrientes",
    number: "1234",
    floor_apt: null,
    city: "CABA",
    province_code: "AR-C",
    postal_code: "C1043",
    notes: null,
    is_default: false,
  });
  expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }));
});
