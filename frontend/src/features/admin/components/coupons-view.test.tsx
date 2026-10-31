import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { CSRF_COOKIE } from "@/lib/api/cookies";
import { ORIGIN } from "@/test/cart";
import { clearCookie, setCookie } from "@/test/cookies";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";

import { CouponsView } from "./coupons-view";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  usePathname: () => "/admin/coupons",
}));

const COUPONS = `${ORIGIN}/api/v1/admin/coupons`;
const COUPON = {
  id: 7,
  code: "VERANO",
  type: "percent",
  value: "10.00",
  min_subtotal_usd: null,
  starts_at: "2026-10-01T15:00:00Z",
  ends_at: null,
  max_uses: 100,
  max_uses_per_user: null,
  used_count: 3,
  is_active: true,
  created_at: "2026-10-01T15:00:00Z",
  updated_at: "2026-10-01T15:00:00Z",
};

function pageOf(items: unknown[]) {
  return { items, page: 1, size: 20, total: items.length, pages: items.length ? 1 : 0 };
}

function serve(initial: unknown[]) {
  let coupons = initial;
  server.use(http.get(COUPONS, () => HttpResponse.json(pageOf(coupons))));
  return (next: unknown[]) => {
    coupons = next;
  };
}

function renderView() {
  renderWithProviders(<CouponsView />, { hasSession: true });
  return userEvent.setup();
}

beforeEach(() => setCookie(CSRF_COOKIE, "token"));
afterEach(() => clearCookie(CSRF_COOKIE));

it("lists the coupons with their discount and uses", async () => {
  serve([COUPON, { ...COUPON, id: 8, code: "FIJO", type: "fixed", value: "25.50", max_uses: null, is_active: false }]);
  renderView();

  const first = (await screen.findByText("VERANO")).closest("tr") as HTMLElement;
  expect(first).toHaveTextContent("10 %");
  expect(first).toHaveTextContent("3 de 100");
  expect(first).toHaveTextContent("Sin vencimiento");
  expect(first).toHaveTextContent("Activo");
  const second = screen.getByText("FIJO").closest("tr") as HTMLElement;
  expect(second).toHaveTextContent("US$");
  expect(second).toHaveTextContent("25,50");
  expect(second).toHaveTextContent("Inactivo");
});

it("creates a coupon and shows it", async () => {
  const update = serve([]);
  let body: Record<string, unknown> = {};
  server.use(
    http.post(COUPONS, async ({ request }) => {
      body = (await request.json()) as Record<string, unknown>;
      update([COUPON]);
      return HttpResponse.json(COUPON, { status: 201 });
    }),
  );
  const user = renderView();

  await user.click(await screen.findByRole("button", { name: "Agregar cupón" }));
  const sheet = await screen.findByRole("dialog", { name: "Nuevo cupón" });
  await user.type(within(sheet).getByLabelText("Código"), "VERANO");
  await user.type(within(sheet).getByLabelText("Valor"), "10,5");
  await user.click(within(sheet).getByRole("button", { name: "Guardar" }));

  expect(await screen.findByText("VERANO")).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(body).toMatchObject({
    code: "VERANO",
    type: "percent",
    value: "10.5",
    min_subtotal_usd: null,
    ends_at: null,
    max_uses: null,
    max_uses_per_user: null,
    is_active: true,
  });
  expect(body.starts_at).toMatch(/Z$/);
});

it("opens the form with the chosen coupon and saves it", async () => {
  const update = serve([COUPON]);
  let body: Record<string, unknown> = {};
  server.use(
    http.patch(`${COUPONS}/7`, async ({ request }) => {
      body = (await request.json()) as Record<string, unknown>;
      update([{ ...COUPON, value: "15.00", max_uses: 50 }]);
      return HttpResponse.json(COUPON);
    }),
  );
  const user = renderView();

  await user.click(await screen.findByRole("button", { name: "Editar VERANO" }));
  const sheet = await screen.findByRole("dialog", { name: "Editar cupón" });
  expect(within(sheet).getByLabelText("Código")).toHaveValue("VERANO");
  expect(within(sheet).getByLabelText("Usos totales")).toHaveValue("100");
  await user.clear(within(sheet).getByLabelText("Valor"));
  await user.type(within(sheet).getByLabelText("Valor"), "15");
  await user.clear(within(sheet).getByLabelText("Usos totales"));
  await user.type(within(sheet).getByLabelText("Usos totales"), "50");
  await user.click(within(sheet).getByRole("button", { name: "Guardar" }));

  expect(await screen.findByText("15 %")).toBeInTheDocument();
  expect(body).toMatchObject({ value: "15", max_uses: 50 });
});

it("puts a taken code on its field, not in the form alert", async () => {
  serve([]);
  server.use(
    http.post(COUPONS, () => HttpResponse.json({ code: "code_taken", message: "Taken." }, { status: 409 })),
  );
  const user = renderView();

  await user.click(await screen.findByRole("button", { name: "Agregar cupón" }));
  const sheet = await screen.findByRole("dialog", { name: "Nuevo cupón" });
  await user.type(within(sheet).getByLabelText("Código"), "VERANO");
  await user.type(within(sheet).getByLabelText("Valor"), "10");
  await user.click(within(sheet).getByRole("button", { name: "Guardar" }));

  expect(await within(sheet).findByText("Ese código ya existe.")).toBeInTheDocument();
  expect(within(sheet).getByLabelText("Código")).toHaveAttribute("aria-invalid", "true");
  expect(within(sheet).queryByRole("alert")).not.toBeInTheDocument();
});

it("explains a used coupon in the form", async () => {
  serve([COUPON]);
  server.use(
    http.patch(`${COUPONS}/7`, () => HttpResponse.json({ code: "coupon_used", message: "Used." }, { status: 409 })),
  );
  const user = renderView();

  await user.click(await screen.findByRole("button", { name: "Editar VERANO" }));
  const sheet = await screen.findByRole("dialog", { name: "Editar cupón" });
  await user.click(within(sheet).getByRole("button", { name: "Guardar" }));

  expect(await within(sheet).findByRole("alert")).toHaveTextContent("El cupón ya se usó");
});

it("deletes after asking, and explains when it is in use", async () => {
  const update = serve([COUPON]);
  let answer = HttpResponse.json({ code: "in_use", message: "In use." }, { status: 409 });
  server.use(http.delete(`${COUPONS}/7`, () => answer));
  const user = renderView();

  await user.click(await screen.findByRole("button", { name: "Eliminar VERANO" }));
  await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Sí, eliminar" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Está en uso");
  expect(screen.getByText("VERANO")).toBeInTheDocument();

  answer = new HttpResponse(null, { status: 204 });
  update([]);
  await user.click(screen.getByRole("button", { name: "Eliminar VERANO" }));
  await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Sí, eliminar" }));
  expect(await screen.findByText("Todavía no hay cupones.")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
