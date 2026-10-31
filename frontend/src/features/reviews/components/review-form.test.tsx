import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { CSRF_COOKIE } from "@/lib/api/cookies";
import { ORIGIN } from "@/test/cart";
import { clearCookie, setCookie } from "@/test/cookies";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";

import { ReviewForm } from "./review-form";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}));

const REVIEWS = `${ORIGIN}/api/v1/products/truper-hammer/reviews`;

function renderForm() {
  const onSaved = jest.fn();
  renderWithProviders(<ReviewForm slug="truper-hammer" onSaved={onSaved} onCancel={jest.fn()} />, {
    hasSession: true,
  });
  return { onSaved, user: userEvent.setup() };
}

async function fill(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("radio", { name: "4 estrellas" }));
  await user.type(screen.getByLabelText("Título"), "Muy bueno");
  await user.type(screen.getByLabelText("Comentario"), "Lo uso todos los días.");
}

beforeEach(() => setCookie(CSRF_COOKIE, "token"));
afterEach(() => clearCookie(CSRF_COOKIE));

it("asks for the rating, the title and the comment", async () => {
  const { user, onSaved } = renderForm();

  await user.click(await screen.findByRole("button", { name: "Enviar opinión" }));

  expect(await screen.findByText("Elegí un puntaje.")).toBeInTheDocument();
  expect(screen.getAllByText("Completá este campo.")).toHaveLength(2);
  expect(onSaved).not.toHaveBeenCalled();
});

it("sends the review in the current language", async () => {
  let url = "";
  let body: unknown;
  server.use(
    http.post(REVIEWS, async ({ request }) => {
      url = request.url;
      body = await request.json();
      return HttpResponse.json({ id: 1 }, { status: 201 });
    }),
  );
  const { user, onSaved } = renderForm();

  await fill(user);
  await user.click(screen.getByRole("button", { name: "Enviar opinión" }));

  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  expect(new URL(url).searchParams.get("locale")).toBe("es");
  expect(body).toEqual({ rating: 4, title: "Muy bueno", body: "Lo uso todos los días." });
});

it.each([
  ["review_exists", 409, "Ya opinaste sobre este producto."],
  ["review_not_allowed", 403, "Solo podés opinar sobre productos que recibiste."],
])("explains %s", async (code, status, message) => {
  server.use(http.post(REVIEWS, () => HttpResponse.json({ code, message: "Failed." }, { status })));
  const { user, onSaved } = renderForm();

  await fill(user);
  await user.click(screen.getByRole("button", { name: "Enviar opinión" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(message);
  expect(onSaved).not.toHaveBeenCalled();
});

it("marks the field the API rejects", async () => {
  server.use(
    http.post(REVIEWS, () =>
      HttpResponse.json(
        { code: "validation_error", message: "Failed.", details: [{ loc: ["body", "title"], msg: "Too long." }] },
        { status: 422 },
      ),
    ),
  );
  const { user } = renderForm();

  await fill(user);
  await user.click(screen.getByRole("button", { name: "Enviar opinión" }));

  expect(await screen.findByText("Revisá este valor.")).toBeInTheDocument();
  expect(screen.getByLabelText("Título")).toHaveAttribute("aria-invalid", "true");
});
