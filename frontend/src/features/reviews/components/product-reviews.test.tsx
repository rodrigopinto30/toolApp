import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { ORIGIN } from "@/test/cart";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";

import { ProductReviews } from "./product-reviews";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}));

const REVIEWS = `${ORIGIN}/api/v1/products/truper-hammer/reviews`;

function review(id: number, title: string) {
  return { id, rating: 5, title, body: "<script>alert(1)</script>", author: "Ana D.", created_at: "2026-10-29T15:00:00Z" };
}

function pageOf(items: ReturnType<typeof review>[], page: number, pages: number) {
  return { items, page, size: 10, total: items.length, pages };
}

it("shows the first page without calling the API, with the text as text", () => {
  renderWithProviders(<ProductReviews slug="truper-hammer" initial={pageOf([review(1, "Excelente")], 1, 1)} />);

  const item = screen.getByRole("listitem");
  expect(within(item).getByRole("heading", { name: "Excelente" })).toBeInTheDocument();
  expect(within(item).getByText("5 de 5 estrellas")).toBeInTheDocument();
  expect(within(item).getByText("<script>alert(1)</script>")).toBeInTheDocument();
  expect(within(item).getByText("Ana D., 29 oct 2026")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Ver más opiniones" })).not.toBeInTheDocument();
});

it("says when a product has no reviews", () => {
  renderWithProviders(<ProductReviews slug="truper-hammer" initial={pageOf([], 1, 0)} />);

  expect(screen.getByText("Este producto todavía no tiene opiniones.")).toBeInTheDocument();
});

it("fetches the next pages and skips a review that moved between them", async () => {
  server.use(
    http.get(REVIEWS, ({ request }) => {
      expect(new URL(request.url).searchParams.get("page")).toBe("2");
      return HttpResponse.json(pageOf([review(1, "Excelente"), review(2, "Bueno")], 2, 2));
    }),
  );
  renderWithProviders(<ProductReviews slug="truper-hammer" initial={pageOf([review(1, "Excelente")], 1, 2)} />);

  await userEvent.setup().click(screen.getByRole("button", { name: "Ver más opiniones" }));

  expect(await screen.findByRole("heading", { name: "Bueno" })).toBeInTheDocument();
  expect(screen.getAllByRole("listitem")).toHaveLength(2);
  expect(screen.queryByRole("button", { name: "Ver más opiniones" })).not.toBeInTheDocument();
});

it("keeps the button and explains a failed page", async () => {
  server.use(http.get(REVIEWS, () => HttpResponse.json({ code: "not_found", message: "Gone." }, { status: 404 })));
  renderWithProviders(<ProductReviews slug="truper-hammer" initial={pageOf([review(1, "Excelente")], 1, 2)} />);

  await userEvent.setup().click(screen.getByRole("button", { name: "Ver más opiniones" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("No lo encontramos o ya no está disponible.");
  expect(screen.getByRole("button", { name: "Ver más opiniones" })).toBeEnabled();
});
