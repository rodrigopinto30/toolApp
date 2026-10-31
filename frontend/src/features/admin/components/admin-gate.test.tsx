import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";

import { ORIGIN } from "@/test/cart";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";

import { AdminGate } from "./admin-gate";

const replace = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh: jest.fn() }),
  usePathname: () => "/es/admin/coupons",
}));

jest.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  usePathname: () => "/admin/coupons",
}));

function renderGate(hasSession = true) {
  renderWithProviders(
    <AdminGate>
      <p>Contenido del panel</p>
    </AdminGate>,
    { hasSession },
  );
}

function serveMe(role: string) {
  server.use(http.get(`${ORIGIN}/api/v1/me`, () => HttpResponse.json({ id: 1, first_name: "Ana", role })));
}

beforeEach(() => replace.mockClear());

it("shows the panel to an admin", async () => {
  serveMe("admin");
  renderGate();

  expect(await screen.findByText("Contenido del panel")).toBeInTheDocument();
});

it("shows a customer the not-found view, never the panel", async () => {
  serveMe("customer");
  renderGate();

  expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Página no encontrada");
  expect(screen.queryByText("Contenido del panel")).not.toBeInTheDocument();
});

it("holds the panel back while it checks the role", async () => {
  serveMe("admin");
  renderGate();

  expect(screen.getByLabelText("Cargando el panel…")).toHaveAttribute("aria-busy", "true");
  expect(screen.queryByText("Contenido del panel")).not.toBeInTheDocument();
  await screen.findByText("Contenido del panel");
});

it("sends a visitor to login", async () => {
  renderGate(false);

  await waitFor(() => expect(replace).toHaveBeenCalledWith("/es/login?next=%2Fes%2Fadmin%2Fcoupons"));
  expect(screen.queryByText("Contenido del panel")).not.toBeInTheDocument();
});

it("explains a failure without showing the panel", async () => {
  server.use(
    http.get(`${ORIGIN}/api/v1/me`, () => HttpResponse.json({ code: "not_found", message: "Gone." }, { status: 404 })),
  );
  renderGate();

  expect(await screen.findByRole("alert")).toHaveTextContent("No lo encontramos");
  expect(screen.queryByText("Contenido del panel")).not.toBeInTheDocument();
});
