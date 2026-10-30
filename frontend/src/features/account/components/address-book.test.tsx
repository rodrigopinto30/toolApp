import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { CSRF_COOKIE } from "@/lib/api/cookies";
import { ORIGIN } from "@/test/cart";
import { clearCookie, setCookie } from "@/test/cookies";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";

import { AddressBook } from "./address-book";

jest.mock("next/navigation", () => ({
  usePathname: () => "/es/account/addresses",
  useRouter: () => ({ replace: jest.fn(), refresh: jest.fn() }),
}));

const PROVINCES = [{ code: "AR-C", name: "Ciudad Autónoma de Buenos Aires" }];
const ADDRESSES = `${ORIGIN}/api/v1/me/addresses`;
const HOME = {
  id: 7,
  label: "Casa",
  recipient_name: "Ana Diaz",
  phone: "1155555555",
  street: "Av. Corrientes",
  number: "1234",
  floor_apt: null,
  city: "CABA",
  province: PROVINCES[0],
  postal_code: "C1043",
  notes: "Timbre roto",
  is_default: true,
};
const WORK = { ...HOME, id: 8, label: "Trabajo", is_default: false, notes: null };

function serve(addresses: unknown[]) {
  let current = addresses;
  server.use(
    http.get(`${ORIGIN}/api/v1/me`, () => HttpResponse.json({ id: 1, role: "customer" })),
    http.get(ADDRESSES, () => HttpResponse.json(current)),
  );
  return (next: unknown[]) => {
    current = next;
  };
}

function renderBook() {
  renderWithProviders(<AddressBook provinces={PROVINCES} />, { hasSession: true });
  return userEvent.setup();
}

beforeEach(() => setCookie(CSRF_COOKIE, "token"));
afterEach(() => clearCookie(CSRF_COOKIE));

it("lists the addresses and marks the default one", async () => {
  serve([HOME, WORK]);
  renderBook();

  const home = (await screen.findByText("Casa")).closest("li") as HTMLElement;
  expect(within(home).getByText("Principal")).toBeInTheDocument();
  expect(within(home).getByText("Timbre roto")).toBeInTheDocument();
  expect(within(home).queryByRole("button", { name: "Usar Casa como principal" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Usar Trabajo como principal" })).toBeInTheDocument();
});

it("explains an empty book and opens the form", async () => {
  serve([]);
  const user = renderBook();

  expect(await screen.findByText("Todavía no guardaste ninguna dirección.")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Agregar dirección" }));

  const sheet = await screen.findByRole("dialog", { name: "Nueva dirección" });
  expect(within(sheet).getByLabelText("Calle")).toHaveValue("");
  expect(within(sheet).getByLabelText("Usar como dirección principal")).toBeChecked();
});

it("opens the form with the chosen address and closes it after saving", async () => {
  const update = serve([HOME]);
  server.use(
    http.patch(`${ADDRESSES}/7`, () => {
      const saved = { ...HOME, street: "Otra calle" };
      update([saved]);
      return HttpResponse.json(saved);
    }),
  );
  const user = renderBook();

  await user.click(await screen.findByRole("button", { name: "Editar Casa" }));
  const sheet = await screen.findByRole("dialog", { name: "Editar dirección" });
  await user.clear(within(sheet).getByLabelText("Calle"));
  await user.type(within(sheet).getByLabelText("Calle"), "Otra calle");
  await user.click(within(sheet).getByRole("button", { name: "Guardar la dirección" }));

  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(await screen.findByText(/Otra calle 1234/)).toBeInTheDocument();
});

it("makes another address the default", async () => {
  const update = serve([HOME, WORK]);
  let body: unknown;
  server.use(
    http.patch(`${ADDRESSES}/8`, async ({ request }) => {
      body = await request.json();
      update([{ ...WORK, is_default: true }, { ...HOME, is_default: false }]);
      return HttpResponse.json({ ...WORK, is_default: true });
    }),
  );
  const user = renderBook();

  await user.click(await screen.findByRole("button", { name: "Usar Trabajo como principal" }));

  expect(await screen.findByRole("button", { name: "Usar Casa como principal" })).toBeInTheDocument();
  expect(body).toEqual({ is_default: true });
});

it("deletes an address after asking", async () => {
  const update = serve([HOME, WORK]);
  server.use(
    http.delete(`${ADDRESSES}/8`, () => {
      update([HOME]);
      return new HttpResponse(null, { status: 204 });
    }),
  );
  const user = renderBook();

  await user.click(await screen.findByRole("button", { name: "Eliminar Trabajo" }));
  const dialog = await screen.findByRole("alertdialog", { name: "¿Eliminar Trabajo?" });
  await user.click(within(dialog).getByRole("button", { name: "Sí, eliminar" }));

  await waitFor(() => expect(screen.queryByText("Trabajo")).not.toBeInTheDocument());
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
});

it("keeps the list and shows why a delete failed", async () => {
  serve([HOME]);
  server.use(
    http.delete(`${ADDRESSES}/7`, () =>
      HttpResponse.json({ code: "not_found", message: "Gone.", request_id: "x" }, { status: 404 }),
    ),
  );
  const user = renderBook();

  await user.click(await screen.findByRole("button", { name: "Eliminar Casa" }));
  await user.click(await screen.findByRole("button", { name: "Sí, eliminar" }));

  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(screen.getByText("Casa")).toBeInTheDocument();
});
