import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { CSRF_COOKIE } from "@/lib/api/cookies";
import { ORIGIN } from "@/test/cart";
import { clearCookie, setCookie } from "@/test/cookies";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";

import { BillingProfileForm } from "./billing-profile-form";

jest.mock("next/navigation", () => ({ useRouter: () => ({ replace: jest.fn(), refresh: jest.fn() }) }));

beforeEach(() => setCookie(CSRF_COOKIE, "token"));
afterEach(() => clearCookie(CSRF_COOKIE));

async function fill(user: ReturnType<typeof userEvent.setup>, taxId: string) {
  await user.type(screen.getByLabelText("Número"), taxId);
  await user.type(screen.getByLabelText("Nombre o razón social"), "Ana Diaz");
  await user.type(screen.getByLabelText("Domicilio fiscal"), "Calle Falsa 123");
  await user.click(screen.getByRole("button", { name: "Guardar los datos" }));
}

it("rejects a CUIT with a wrong check digit", async () => {
  const user = userEvent.setup();
  renderWithProviders(<BillingProfileForm onSaved={jest.fn()} />);

  await fill(user, "20-12345678-5");

  expect(await screen.findByText("El CUIT no es válido.")).toBeInTheDocument();
});

it("only accepts a DNI for a final consumer", async () => {
  const user = userEvent.setup();
  renderWithProviders(<BillingProfileForm onSaved={jest.fn()} />);

  await user.click(screen.getByText("DNI"));
  await fill(user, "12.345.678");

  expect(await screen.findByText("Con DNI solo podés facturar como consumidor final.")).toBeInTheDocument();
});

it("creates the profile with digits only", async () => {
  let body: unknown;
  server.use(
    http.post(`${ORIGIN}/api/v1/me/billing-profiles`, async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({ id: 3, ...(body as object) }, { status: 201 });
    }),
  );
  const onSaved = jest.fn();
  const user = userEvent.setup();
  renderWithProviders(<BillingProfileForm onSaved={onSaved} />);

  await fill(user, "20-12345678-6");

  await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 3 })));
  expect(body).toEqual({
    tax_id_type: "CUIT",
    tax_id: "20123456786",
    tax_condition: "monotributo",
    legal_name: "Ana Diaz",
    fiscal_address: "Calle Falsa 123",
    is_default: false,
  });
});

const SAVED = {
  id: 3,
  tax_id_type: "CUIT",
  tax_id: "20329642330",
  tax_condition: "monotributo",
  legal_name: "Ana Diaz",
  fiscal_address: "Av. Corrientes 1234",
  is_default: true,
} as const;

it("loads a profile and leaves out a default it cannot unset", async () => {
  let body: unknown;
  server.use(
    http.patch(`${ORIGIN}/api/v1/me/billing-profiles/3`, async ({ request }) => {
      body = await request.json();
      return HttpResponse.json(SAVED);
    }),
  );
  const onSaved = jest.fn();
  const user = userEvent.setup();
  renderWithProviders(<BillingProfileForm profile={SAVED} onSaved={onSaved} />);

  expect(screen.getByLabelText("Nombre o razón social")).toHaveValue("Ana Diaz");
  expect(screen.queryByLabelText("Usar como datos principales")).not.toBeInTheDocument();
  await user.clear(screen.getByLabelText("Domicilio fiscal"));
  await user.type(screen.getByLabelText("Domicilio fiscal"), "Otra calle 5");
  await user.click(screen.getByRole("button", { name: "Guardar los datos" }));

  await waitFor(() => expect(onSaved).toHaveBeenCalledWith(SAVED));
  expect(body).toEqual({
    tax_id_type: "CUIT",
    tax_id: "20329642330",
    tax_condition: "monotributo",
    legal_name: "Ana Diaz",
    fiscal_address: "Otra calle 5",
  });
});
