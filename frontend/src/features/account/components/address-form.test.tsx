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
  renderWithProviders(<AddressForm provinces={PROVINCES} onSaved={jest.fn()} />);

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
  const onSaved = jest.fn();
  const user = userEvent.setup();
  renderWithProviders(<AddressForm provinces={PROVINCES} onSaved={onSaved} />);

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
  expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }));
});

const SAVED = {
  id: 7,
  label: "Casa",
  recipient_name: "Ana Diaz",
  phone: "1155555555",
  street: "Av. Corrientes",
  number: "1234",
  floor_apt: "3B",
  city: "CABA",
  province: PROVINCES[0],
  postal_code: "C1043",
  notes: null,
  is_default: true,
};

function servePatch() {
  const calls: unknown[] = [];
  server.use(
    http.patch(`${ORIGIN}/api/v1/me/addresses/7`, async ({ request }) => {
      calls.push(await request.json());
      return HttpResponse.json(SAVED);
    }),
  );
  return calls;
}

it("loads an address and sends a floor left empty as null", async () => {
  const calls = servePatch();
  const onSaved = jest.fn();
  const user = userEvent.setup();
  renderWithProviders(<AddressForm provinces={PROVINCES} address={SAVED} onSaved={onSaved} />);

  expect(screen.getByLabelText("Calle")).toHaveValue("Av. Corrientes");
  expect(screen.getByRole("combobox", { name: "Provincia" })).toHaveTextContent(PROVINCES[0].name);
  await user.clear(screen.getByLabelText("Piso y depto."));
  await user.click(screen.getByRole("button", { name: "Guardar la dirección" }));

  await screen.findByRole("button", { name: "Guardar la dirección" });
  expect(calls[0]).toEqual({
    label: "Casa",
    recipient_name: "Ana Diaz",
    phone: "1155555555",
    street: "Av. Corrientes",
    number: "1234",
    floor_apt: null,
    city: "CABA",
    province_code: "AR-C",
    postal_code: "C1043",
    notes: null,
  });
  expect(onSaved).toHaveBeenCalledWith(SAVED);
});

it("offers no way to unset the default address", () => {
  renderWithProviders(<AddressForm provinces={PROVINCES} address={SAVED} onSaved={jest.fn()} />);

  expect(screen.queryByLabelText("Usar como dirección principal")).not.toBeInTheDocument();
});

it("can turn another address into the default one", async () => {
  const calls = servePatch();
  const user = userEvent.setup();
  renderWithProviders(
    <AddressForm provinces={PROVINCES} address={{ ...SAVED, is_default: false }} onSaved={jest.fn()} />,
  );

  await user.click(screen.getByLabelText("Usar como dirección principal"));
  await user.click(screen.getByRole("button", { name: "Guardar la dirección" }));

  await screen.findByRole("button", { name: "Guardar la dirección" });
  expect(calls[0]).toEqual(expect.objectContaining({ is_default: true }));
});
