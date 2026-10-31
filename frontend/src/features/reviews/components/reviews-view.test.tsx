import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { CSRF_COOKIE } from "@/lib/api/cookies";
import { ORIGIN } from "@/test/cart";
import { clearCookie, setCookie } from "@/test/cookies";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";

import { ReviewsView } from "./reviews-view";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), refresh: jest.fn() }),
  usePathname: () => "/es/account/reviews",
}));

jest.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const PRODUCT = { slug: "truper-hammer", name: "Martillo", image: null };
const SENT = {
  id: 1,
  product: PRODUCT,
  rating: 4,
  title: "Muy bueno",
  body: "<b>Lo uso</b> todos los días.",
  status: "pending",
  created_at: "2026-10-29T15:00:00Z",
};

function pageOf(items: unknown[], page = 1, pages = 1) {
  return { items, page, size: 10, total: items.length, pages };
}

function serve({ reviewable, own }: { reviewable: unknown[]; own: unknown[] }) {
  let products = reviewable;
  let reviews = own;
  server.use(
    http.get(`${ORIGIN}/api/v1/me`, () => HttpResponse.json({ id: 1, role: "customer" })),
    http.get(`${ORIGIN}/api/v1/me/reviewable`, () => HttpResponse.json(pageOf(products))),
    http.get(`${ORIGIN}/api/v1/me/reviews`, () => HttpResponse.json(pageOf(reviews))),
    http.post(`${ORIGIN}/api/v1/products/truper-hammer/reviews`, () => {
      products = [];
      reviews = [SENT];
      return HttpResponse.json(SENT, { status: 201 });
    }),
  );
}

beforeEach(() => setCookie(CSRF_COOKIE, "token"));
afterEach(() => clearCookie(CSRF_COOKIE));

it("says when there is nothing to review or to show", async () => {
  serve({ reviewable: [], own: [] });

  renderWithProviders(<ReviewsView />, { hasSession: true });

  expect(await screen.findByText(/No tenés productos para opinar/)).toBeInTheDocument();
  expect(screen.getByText("Todavía no enviaste opiniones.")).toBeInTheDocument();
});

it.each([
  ["pending", "En revisión"],
  ["approved", "Publicada"],
  ["rejected", "Rechazada"],
])("shows a %s review with its status, as plain text", async (status, label) => {
  serve({ reviewable: [], own: [{ ...SENT, status }] });

  renderWithProviders(<ReviewsView />, { hasSession: true });

  const item = await screen.findByRole("listitem");
  expect(within(item).getByText(label)).toBeInTheDocument();
  expect(within(item).getByRole("link", { name: "Martillo" })).toHaveAttribute("href", "/products/truper-hammer");
  expect(within(item).getByText("4 de 5 estrellas")).toBeInTheDocument();
  expect(within(item).getByText("<b>Lo uso</b> todos los días.")).toBeInTheDocument();
});

it("moves a product to the sent reviews after reviewing it", async () => {
  serve({ reviewable: [PRODUCT], own: [] });
  renderWithProviders(<ReviewsView />, { hasSession: true });
  const user = userEvent.setup();

  await user.click(await screen.findByRole("button", { name: "Opinar sobre Martillo" }));
  const sheet = await screen.findByRole("dialog", { name: "Tu opinión sobre Martillo" });
  await user.click(within(sheet).getByRole("radio", { name: "4 estrellas" }));
  await user.type(within(sheet).getByLabelText("Título"), "Muy bueno");
  await user.type(within(sheet).getByLabelText("Comentario"), "Lo uso todos los días.");
  await user.click(within(sheet).getByRole("button", { name: "Enviar opinión" }));

  expect(await screen.findByText("En revisión")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Opinar sobre Martillo" })).not.toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});

it("loads more reviews on request", async () => {
  server.use(
    http.get(`${ORIGIN}/api/v1/me`, () => HttpResponse.json({ id: 1, role: "customer" })),
    http.get(`${ORIGIN}/api/v1/me/reviewable`, () => HttpResponse.json(pageOf([]))),
    http.get(`${ORIGIN}/api/v1/me/reviews`, ({ request }) => {
      const page = Number(new URL(request.url).searchParams.get("page"));
      return HttpResponse.json(pageOf([{ ...SENT, id: page, title: `Opinión ${page}` }], page, 2));
    }),
  );
  renderWithProviders(<ReviewsView />, { hasSession: true });
  const user = userEvent.setup();

  await user.click(await screen.findByRole("button", { name: "Ver más" }));

  expect(await screen.findByText("Opinión 2")).toBeInTheDocument();
  expect(screen.getByText("Opinión 1")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Ver más" })).not.toBeInTheDocument();
});
