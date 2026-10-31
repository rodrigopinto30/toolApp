import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { CSRF_COOKIE } from "@/lib/api/cookies";
import { ORIGIN } from "@/test/cart";
import { clearCookie, setCookie } from "@/test/cookies";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";

import { ReviewsView } from "./reviews-view";

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

const REVIEWS = `${ORIGIN}/api/v1/admin/reviews`;
const REVIEW = {
  id: 3,
  product: { id: 5, slug: "taladro", name: { es: "Taladro", en: "Drill" } },
  author: { id: 4, email: "ana@example.com", first_name: "Ana", last_name: "Diaz" },
  rating: 4,
  title: "Muy bueno",
  body: "<script>alert(1)</script>",
  status: "pending",
  created_at: "2026-10-29T15:00:00Z",
  updated_at: "2026-10-29T15:00:00Z",
};

function serve() {
  let review = REVIEW;
  const requests: URL[] = [];
  server.use(
    http.get(REVIEWS, ({ request }) => {
      requests.push(new URL(request.url));
      return HttpResponse.json({ items: [review], page: 1, size: 20, total: 1, pages: 1 });
    }),
    http.post(`${REVIEWS}/3/approve`, () => {
      review = { ...review, status: "approved" };
      return HttpResponse.json(review);
    }),
    http.post(`${REVIEWS}/3/reject`, () => {
      review = { ...review, status: "rejected" };
      return HttpResponse.json(review);
    }),
  );
  return requests;
}

beforeEach(() => setCookie(CSRF_COOKIE, "token"));
afterEach(() => clearCookie(CSRF_COOKIE));

it("opens on the pending reviews and shows the text as text", async () => {
  const requests = serve();
  renderWithProviders(<ReviewsView />, { hasSession: true });

  expect(await screen.findByText("<script>alert(1)</script>")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Taladro" })).toHaveAttribute("href", "/products/taladro");
  expect(screen.getByText("ana@example.com")).toBeInTheDocument();
  expect(requests[0].searchParams.get("status")).toBe("pending");
});

it("lists every status without a filter", async () => {
  const requests = serve();
  renderWithProviders(<ReviewsView />, { hasSession: true, searchParams: "?status=all" });

  await waitFor(() => expect(requests.length).toBeGreaterThan(0));
  expect(requests[0].searchParams.has("status")).toBe(false);
});

it("approves a review, and then only offers to reject it", async () => {
  serve();
  renderWithProviders(<ReviewsView />, { hasSession: true });
  const user = userEvent.setup();

  await user.click(await screen.findByRole("button", { name: "Aprobar Muy bueno" }));

  expect(await screen.findByText("Publicada")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Aprobar Muy bueno" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Rechazar Muy bueno" })).toBeInTheDocument();
});

it("rejects a review, and then only offers to approve it", async () => {
  serve();
  renderWithProviders(<ReviewsView />, { hasSession: true });
  const user = userEvent.setup();

  await user.click(await screen.findByRole("button", { name: "Rechazar Muy bueno" }));

  expect(await screen.findByText("Rechazada")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Rechazar Muy bueno" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Aprobar Muy bueno" })).toBeInTheDocument();
});
