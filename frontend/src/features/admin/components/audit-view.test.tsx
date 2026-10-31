import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { ORIGIN } from "@/test/cart";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";

import { auditValue, AuditView } from "./audit-view";

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

const LOG = {
  id: 9,
  actor_id: 1,
  actor_email: "admin@example.com",
  action: "update",
  entity: "coupon",
  entity_id: "7",
  changes: {
    value: { before: "10.00", after: "<b>15.00</b>" },
    ends_at: { before: null, after: "2026-12-01T00:00:00Z" },
  },
  ip: "127.0.0.1",
  request_id: "abc",
  created_at: "2026-10-29T15:00:00Z",
};

function serve(items: unknown[] = [LOG]) {
  const requests: URL[] = [];
  server.use(
    http.get(`${ORIGIN}/api/v1/admin/audit-logs`, ({ request }) => {
      requests.push(new URL(request.url));
      return HttpResponse.json({ items, page: 1, size: 20, total: items.length, pages: 1 });
    }),
  );
  return requests;
}

it("shows who did what, with before and after as text", async () => {
  serve();
  renderWithProviders(<AuditView />, { hasSession: true });

  const row = (await screen.findByText("admin@example.com")).closest("tr") as HTMLElement;
  expect(row).toHaveTextContent("coupon #7");
  expect(row).toHaveTextContent("2 cambios");
  expect(screen.getByText("Antes: 10.00")).toBeInTheDocument();
  expect(screen.getByText("Después: <b>15.00</b>")).toBeInTheDocument();
  expect(screen.getByText("Antes: —")).toBeInTheDocument();
  expect(row.querySelector("b")).toBeNull();
});

it("names the system when a change has no actor, and allows no changes", async () => {
  serve([{ ...LOG, actor_email: null, changes: null }]);
  renderWithProviders(<AuditView />, { hasSession: true });

  expect(await screen.findByText("Sistema")).toBeInTheDocument();
  expect(screen.queryByText(/cambios?$/)).not.toBeInTheDocument();
});

it("asks the API with the filters and goes back to the first page", async () => {
  const requests = serve();
  renderWithProviders(<AuditView />, { hasSession: true, searchParams: "?page=3" });
  const user = userEvent.setup();

  await user.type(await screen.findByLabelText("Entidad"), "coupon");
  await user.type(screen.getByLabelText("Acción"), "update");
  await user.type(screen.getByLabelText("Desde"), "2026-10-01");
  await user.click(screen.getByRole("button", { name: "Filtrar" }));

  await waitFor(() => expect(requests.at(-1)?.searchParams.get("entity")).toBe("coupon"));
  const query = requests.at(-1)?.searchParams;
  expect(query?.get("action")).toBe("update");
  expect(query?.get("page")).toBe("1");
  expect(query?.get("date_from")).toMatch(/^2026-(09-30|10-01)T.*Z$/);
  expect(query?.has("date_to")).toBe(false);
});

it("reads the filters from the URL and clears them", async () => {
  const requests = serve();
  renderWithProviders(<AuditView />, { hasSession: true, searchParams: "?entity=coupon&from=not-a-date" });
  const user = userEvent.setup();

  expect(await screen.findByLabelText("Entidad")).toHaveValue("coupon");
  await waitFor(() => expect(requests.length).toBeGreaterThan(0));
  expect(requests[0].searchParams.get("entity")).toBe("coupon");
  expect(requests[0].searchParams.has("date_from")).toBe(false);

  await user.click(screen.getByRole("button", { name: "Limpiar" }));

  await waitFor(() => expect(requests.at(-1)?.searchParams.has("entity")).toBe(false));
  expect(screen.getByLabelText("Entidad")).toHaveValue("");
});

it("renders any value as text", () => {
  expect(auditValue(null)).toBe("—");
  expect(auditValue(false)).toBe("false");
  expect(auditValue(12)).toBe("12");
  expect(auditValue({ es: "Hola" })).toBe('{"es":"Hola"}');
});
