import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { ORIGIN } from "@/test/cart";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";

import { OrdersView } from "./orders-view";

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

const ORDER = {
  number: "TA-2026-000007",
  status: "preparing",
  total: { amount: "10150", currency: "ARS" },
  item_count: 3,
  created_at: "2026-10-29T15:00:00Z",
  delivery_method: "pickup",
  customer: { id: 4, email: "ana@example.com", first_name: "Ana", last_name: "Diaz" },
};

function serve() {
  const requests: URL[] = [];
  server.use(
    http.get(`${ORIGIN}/api/v1/admin/orders`, ({ request }) => {
      requests.push(new URL(request.url));
      return HttpResponse.json({ items: [ORDER], page: 1, size: 20, total: 1, pages: 1 });
    }),
  );
  return requests;
}

it("lists each order with its customer, delivery, total and status", async () => {
  serve();
  renderWithProviders(<OrdersView />, { hasSession: true });

  const link = await screen.findByRole("link", { name: "TA-2026-000007" });
  expect(link).toHaveAttribute("href", "/admin/orders/TA-2026-000007");
  const row = link.closest("tr") as HTMLElement;
  expect(row).toHaveTextContent("ana@example.com");
  expect(row).toHaveTextContent("Retiro en el local");
  expect(row).toHaveTextContent("10.150");
  expect(row).toHaveTextContent("En preparación");
});

it("reads the filters from the URL", async () => {
  const requests = serve();
  renderWithProviders(<OrdersView />, { hasSession: true, searchParams: "?status=paid&email=ana&from=2026-10-01" });

  await waitFor(() => expect(requests.length).toBeGreaterThan(0));
  const query = requests[0].searchParams;
  expect(query.get("status")).toBe("paid");
  expect(query.get("email")).toBe("ana");
  expect(query.get("date_from")).toMatch(/Z$/);
  expect(query.has("date_to")).toBe(false);
});

it("ignores a status the API would reject", async () => {
  const requests = serve();
  renderWithProviders(<OrdersView />, { hasSession: true, searchParams: "?status=nope&from=ayer" });

  await waitFor(() => expect(requests.length).toBeGreaterThan(0));
  expect(requests[0].searchParams.has("status")).toBe(false);
  expect(requests[0].searchParams.has("date_from")).toBe(false);
});

it("filters by number and goes back to the first page", async () => {
  const requests = serve();
  renderWithProviders(<OrdersView />, { hasSession: true, searchParams: "?page=3" });
  const user = userEvent.setup();

  await user.type(await screen.findByLabelText("Número"), "TA-2026-000007");
  await user.click(screen.getByRole("button", { name: "Filtrar" }));

  await waitFor(() => expect(requests.at(-1)?.searchParams.get("number")).toBe("TA-2026-000007"));
  expect(requests.at(-1)?.searchParams.get("page")).toBe("1");
});
