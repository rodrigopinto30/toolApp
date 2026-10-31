import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { CSRF_COOKIE } from "@/lib/api/cookies";
import { ORIGIN } from "@/test/cart";
import { clearCookie, setCookie } from "@/test/cookies";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";

import { AttributesView } from "./attributes-view";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const mockReplace = jest.fn();

jest.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  usePathname: () => "/admin/products",
  useRouter: () => ({ replace: mockReplace }),
}));

const ATTRIBUTES = `${ORIGIN}/api/v1/admin/attributes`;
const RED = { id: 11, attribute_id: 1, slug: "rojo", value: { es: "Rojo", en: "Red" }, position: 0 };
const BLUE = { ...RED, id: 12, slug: "azul", value: { es: "Azul", en: "Blue" } };
const COLOR = { id: 1, code: "color", name: { es: "Color", en: "Color" }, is_filterable: true, values: [RED] };

function serve() {
  let attribute = COLOR;
  const bodies: unknown[] = [];
  server.use(
    http.get(ATTRIBUTES, () => HttpResponse.json({ items: [attribute], page: 1, size: 100, total: 1, pages: 1 })),
    http.post(`${ATTRIBUTES}/1/values`, async ({ request }) => {
      bodies.push(await request.json());
      attribute = { ...attribute, values: [RED, BLUE] };
      return HttpResponse.json(BLUE, { status: 201 });
    }),
    http.delete(`${ATTRIBUTES}/1/values/11`, () => {
      attribute = { ...attribute, values: attribute.values.filter((value) => value.id !== RED.id) };
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return bodies;
}

beforeEach(() => setCookie(CSRF_COOKIE, "token"));
afterEach(() => clearCookie(CSRF_COOKIE));

it("adds a value and keeps the panel open with the list up to date", async () => {
  const bodies = serve();
  renderWithProviders(<AttributesView />, { hasSession: true });
  const user = userEvent.setup();

  await user.click(await screen.findByRole("button", { name: "Valores de color" }));
  const sheet = await screen.findByRole("dialog", { name: "Valores de Color" });
  expect(within(sheet).getByRole("listitem")).toHaveTextContent("Rojo");
  await user.type(within(sheet).getByLabelText("Valor (español)"), "Azul");
  await user.type(within(sheet).getByLabelText("Valor (inglés)"), "Blue");
  await user.type(within(sheet).getByLabelText("Slug"), "azul");
  await user.click(within(sheet).getByRole("button", { name: "Guardar" }));

  expect(await within(sheet).findByText("Azul")).toBeInTheDocument();
  expect(bodies).toEqual([{ slug: "azul", value: { es: "Azul", en: "Blue" }, position: 0 }]);
  await waitFor(() => expect(within(sheet).getByLabelText("Slug")).toHaveValue(""));
});

it("deletes a value after asking", async () => {
  serve();
  renderWithProviders(<AttributesView />, { hasSession: true });
  const user = userEvent.setup();

  await user.click(await screen.findByRole("button", { name: "Valores de color" }));
  const sheet = await screen.findByRole("dialog", { name: "Valores de Color" });
  await user.click(within(sheet).getByRole("button", { name: "Eliminar rojo" }));
  await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Sí, eliminar" }));

  expect(await within(sheet).findByText("Todavía no tiene valores.")).toBeInTheDocument();
});

it("shows how many values an attribute has", async () => {
  serve();
  renderWithProviders(<AttributesView />, { hasSession: true });

  expect(await screen.findByRole("button", { name: "Valores de color" })).toHaveTextContent("1 valor");
});
