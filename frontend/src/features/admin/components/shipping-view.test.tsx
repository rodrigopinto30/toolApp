import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { CSRF_COOKIE } from "@/lib/api/cookies";
import { ORIGIN } from "@/test/cart";
import { clearCookie, setCookie } from "@/test/cookies";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";

import { ShippingView } from "./shipping-view";

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

const ZONES = `${ORIGIN}/api/v1/admin/zones`;
const PROVINCES = `${ORIGIN}/api/v1/admin/provinces`;
const CENTER = {
  id: 1,
  code: "centro",
  name: { es: "Centro", en: "Center" },
  cost_usd: "5.00",
  free_over_usd: "100.00",
  eta_min_days: 2,
  eta_max_days: 4,
  is_active: true,
};
const SOUTH = { ...CENTER, id: 2, code: "sur", name: { es: "Sur", en: "South" }, free_over_usd: null };

function pageOf(items: unknown[]) {
  return { items, page: 1, size: 100, total: items.length, pages: 1 };
}

function serve() {
  let province = { code: "AR-U", name: "Chubut", shipping_zone_id: 1 };
  const bodies: unknown[] = [];
  server.use(
    http.get(ZONES, () => HttpResponse.json(pageOf([CENTER, SOUTH]))),
    http.get(PROVINCES, () => HttpResponse.json(pageOf([province]))),
    http.patch(`${PROVINCES}/AR-U`, async ({ request }) => {
      const body = (await request.json()) as { shipping_zone_id: number };
      bodies.push(body);
      province = { ...province, ...body };
      return HttpResponse.json(province);
    }),
  );
  return bodies;
}

beforeEach(() => setCookie(CSRF_COOKIE, "token"));
afterEach(() => clearCookie(CSRF_COOKIE));

it("lists the zones in the current language with what the API sends", async () => {
  serve();
  renderWithProviders(<ShippingView />, { hasSession: true });

  const center = (await screen.findByText("centro")).closest("tr") as HTMLElement;
  expect(center).toHaveTextContent("Centro");
  expect(center).toHaveTextContent("2 a 4 días");
  expect(screen.getByText("sur").closest("tr")).toHaveTextContent("Nunca");
});

it("moves a province to another zone", async () => {
  const bodies = serve();
  renderWithProviders(<ShippingView />, { hasSession: true });
  const user = userEvent.setup();

  const zone = await screen.findByRole("combobox", { name: "Zona de Chubut" });
  await waitFor(() => expect(zone).toHaveTextContent("Centro"));
  await user.click(zone);
  await user.click(await screen.findByRole("option", { name: "Sur" }));

  await waitFor(() => expect(bodies).toEqual([{ shipping_zone_id: 2 }]));
  await waitFor(() => expect(screen.getByRole("combobox", { name: "Zona de Chubut" })).toHaveTextContent("Sur"));
});

it("creates a zone with its name in both languages", async () => {
  serve();
  let body: unknown;
  server.use(
    http.post(ZONES, async ({ request }) => {
      body = await request.json();
      return HttpResponse.json(SOUTH, { status: 201 });
    }),
  );
  renderWithProviders(<ShippingView />, { hasSession: true });
  const user = userEvent.setup();

  await user.click(await screen.findByRole("button", { name: "Agregar zona" }));
  const sheet = await screen.findByRole("dialog", { name: "Nueva zona" });
  await user.type(within(sheet).getByLabelText("Código"), "patagonia");
  await user.type(within(sheet).getByLabelText("Nombre (español)"), "Patagonia");
  await user.type(within(sheet).getByLabelText("Nombre (inglés)"), "Patagonia");
  await user.type(within(sheet).getByLabelText("Costo en USD"), "12,5");
  await user.type(within(sheet).getByLabelText("Días mínimos"), "3");
  await user.type(within(sheet).getByLabelText("Días máximos"), "7");
  await user.click(within(sheet).getByRole("button", { name: "Guardar" }));

  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(body).toEqual({
    code: "patagonia",
    name: { es: "Patagonia", en: "Patagonia" },
    cost_usd: "12.5",
    free_over_usd: null,
    eta_min_days: 3,
    eta_max_days: 7,
    is_active: true,
  });
});

it("keeps a zone that still has provinces, and says why", async () => {
  serve();
  server.use(
    http.delete(`${ZONES}/1`, () => HttpResponse.json({ code: "in_use", message: "In use." }, { status: 409 })),
  );
  renderWithProviders(<ShippingView />, { hasSession: true });
  const user = userEvent.setup();

  await user.click(await screen.findByRole("button", { name: "Eliminar centro" }));
  await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Sí, eliminar" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Está en uso");
});
