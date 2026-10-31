import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { CSRF_COOKIE } from "@/lib/api/cookies";
import { ORIGIN } from "@/test/cart";
import { clearCookie, setCookie } from "@/test/cookies";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";

import { ExchangeRatesView } from "./exchange-rates-view";

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

const RATES = `${ORIGIN}/api/v1/admin/exchange-rates`;
const LATEST = { id: 2, rate: "1450.500000", created_by: 1, created_at: "2026-10-29T15:00:00Z" };
const OLDER = { id: 1, rate: "1400.000000", created_by: 1, created_at: "2026-10-01T15:00:00Z" };

function pageOf(items: unknown[], page = 1) {
  return { items, page, size: 20, total: items.length, pages: page };
}

beforeEach(() => setCookie(CSRF_COOKIE, "token"));
afterEach(() => clearCookie(CSRF_COOKIE));

it("marks only the latest rate as the current one", async () => {
  server.use(http.get(RATES, () => HttpResponse.json(pageOf([LATEST, OLDER]))));
  renderWithProviders(<ExchangeRatesView />, { hasSession: true });

  const latest = (await screen.findByText("Vigente")).closest("tr") as HTMLElement;
  expect(latest).toHaveTextContent("1.450,5");
  expect(screen.getAllByText("Vigente")).toHaveLength(1);
  expect(screen.getByRole("row", { name: /1\.400/ })).not.toHaveTextContent("Vigente");
});

it("does not call the first row of an older page current", async () => {
  server.use(http.get(RATES, () => HttpResponse.json(pageOf([OLDER], 2))));
  renderWithProviders(<ExchangeRatesView />, { hasSession: true, searchParams: "?page=2" });

  expect(await screen.findByText(/1\.400/)).toBeInTheDocument();
  expect(screen.queryByText("Vigente")).not.toBeInTheDocument();
});

it("appends a rate, and rejects an invalid one before sending it", async () => {
  let rates = [OLDER];
  let body: unknown;
  server.use(
    http.get(RATES, () => HttpResponse.json(pageOf(rates))),
    http.post(RATES, async ({ request }) => {
      body = await request.json();
      rates = [LATEST, OLDER];
      return HttpResponse.json(LATEST, { status: 201 });
    }),
  );
  renderWithProviders(<ExchangeRatesView />, { hasSession: true });
  const user = userEvent.setup();

  await user.click(await screen.findByRole("button", { name: "Cargar cotización" }));
  const sheet = await screen.findByRole("dialog", { name: "Nueva cotización" });
  await user.type(within(sheet).getByLabelText("Pesos por dólar"), "0");
  await user.click(within(sheet).getByRole("button", { name: "Guardar" }));
  expect(await within(sheet).findByText(/Ingresá una cotización mayor a 0/)).toBeInTheDocument();
  expect(body).toBeUndefined();

  await user.clear(within(sheet).getByLabelText("Pesos por dólar"));
  await user.type(within(sheet).getByLabelText("Pesos por dólar"), "1450,5");
  await user.click(within(sheet).getByRole("button", { name: "Guardar" }));

  expect(await screen.findByText(/1\.450,5/)).toBeInTheDocument();
  expect(body).toEqual({ rate: "1450.5" });
});
