import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { CSRF_COOKIE } from "@/lib/api/cookies";
import { ORIGIN } from "@/test/cart";
import { clearCookie, setCookie } from "@/test/cookies";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";

import { UsersView } from "./users-view";

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

const USERS = `${ORIGIN}/api/v1/admin/users`;
const ADMIN = {
  id: 1,
  email: "admin@example.com",
  first_name: "Ada",
  last_name: "Admin",
  phone: null,
  role: "admin",
  is_active: true,
  email_verified_at: "2026-10-01T15:00:00Z",
  last_login_at: "2026-10-29T15:00:00Z",
  created_at: "2026-10-01T15:00:00Z",
  updated_at: "2026-10-01T15:00:00Z",
};
const CUSTOMER = { ...ADMIN, id: 2, email: "ana@example.com", first_name: "Ana", role: "customer", last_login_at: null };

function serve() {
  let customer = CUSTOMER;
  const bodies: unknown[] = [];
  const requests: URL[] = [];
  server.use(
    http.get(`${ORIGIN}/api/v1/me`, () => HttpResponse.json({ ...ADMIN, email_verified: true })),
    http.get(USERS, ({ request }) => {
      requests.push(new URL(request.url));
      return HttpResponse.json({ items: [ADMIN, customer], page: 1, size: 20, total: 2, pages: 1 });
    }),
    http.patch(`${USERS}/2`, async ({ request }) => {
      const body = (await request.json()) as object;
      bodies.push(body);
      customer = { ...customer, ...body };
      return HttpResponse.json(customer);
    }),
  );
  return { bodies, requests };
}

function renderView() {
  renderWithProviders(<UsersView />, { hasSession: true });
  return userEvent.setup();
}

beforeEach(() => setCookie(CSRF_COOKIE, "token"));
afterEach(() => clearCookie(CSRF_COOKIE));

it("hides the actions on your own row", async () => {
  serve();
  renderView();

  await screen.findByRole("button", { name: "Desactivar a ana@example.com" });
  expect(await screen.findByText("Vos")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /admin@example.com/ })).not.toBeInTheDocument();
});

it("shows role, status and a user who never logged in", async () => {
  serve();
  renderView();

  const row = (await screen.findByText("ana@example.com")).closest("tr") as HTMLElement;
  expect(row).toHaveTextContent("Cliente");
  expect(row).toHaveTextContent("Activo");
  expect(row).toHaveTextContent("Nunca");
});

it("flags a user who has not confirmed the email", async () => {
  serve();
  server.use(
    http.get(USERS, () =>
      HttpResponse.json({ items: [{ ...CUSTOMER, email_verified_at: null }], page: 1, size: 20, total: 1, pages: 1 }),
    ),
  );
  renderView();

  expect((await screen.findByText("ana@example.com")).closest("tr")).toHaveTextContent("Sin confirmar");
});

it("deactivates after warning about the sessions, and can activate again", async () => {
  const { bodies } = serve();
  const user = renderView();

  await user.click(await screen.findByRole("button", { name: "Desactivar a ana@example.com" }));
  const dialog = await screen.findByRole("alertdialog");
  expect(dialog).toHaveTextContent("se cierran todas sus sesiones");
  await user.click(within(dialog).getByRole("button", { name: "Sí, confirmar" }));
  await user.click(await screen.findByRole("button", { name: "Activar a ana@example.com" }));

  expect(await screen.findByRole("button", { name: "Desactivar a ana@example.com" })).toBeInTheDocument();
  expect(bodies).toEqual([{ is_active: false }, { is_active: true }]);
});

it("changes the role after asking", async () => {
  const { bodies } = serve();
  const user = renderView();

  await user.click(await screen.findByRole("button", { name: "Hacer administrador a ana@example.com" }));
  await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Sí, confirmar" }));

  expect(await screen.findByRole("button", { name: "Quitar administrador a ana@example.com" })).toBeInTheDocument();
  expect(bodies).toEqual([{ role: "admin" }]);
});

it.each([
  ["last_admin", "Tiene que quedar al menos un administrador activo."],
  ["self_change", "No podés desactivarte ni quitarte el rol a vos mismo."],
])("explains %s when the state changed underneath", async (code, message) => {
  serve();
  server.use(http.patch(`${USERS}/2`, () => HttpResponse.json({ code, message: "No." }, { status: 409 })));
  const user = renderView();

  await user.click(await screen.findByRole("button", { name: "Desactivar a ana@example.com" }));
  await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Sí, confirmar" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(message);
});

it("reads the filters from the URL and skips a search that is too short", async () => {
  const { requests } = serve();
  renderWithProviders(<UsersView />, { hasSession: true, searchParams: "?q=a&role=admin&status=inactive" });

  await waitFor(() => expect(requests.length).toBeGreaterThan(0));
  const query = requests[0].searchParams;
  expect(query.has("q")).toBe(false);
  expect(query.get("role")).toBe("admin");
  expect(query.get("is_active")).toBe("false");
});
