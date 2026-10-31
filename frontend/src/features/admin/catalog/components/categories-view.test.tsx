import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { CSRF_COOKIE } from "@/lib/api/cookies";
import { ORIGIN } from "@/test/cart";
import { clearCookie, setCookie } from "@/test/cookies";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";

import { CategoriesView } from "./categories-view";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const mockReplace = jest.fn();

jest.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  usePathname: () => "/admin/products",
  useRouter: () => ({ replace: mockReplace }),
}));

const CATEGORIES = `${ORIGIN}/api/v1/admin/categories`;
const TOOLS = {
  id: 1,
  parent_id: null,
  slug: "herramientas",
  name: { es: "Herramientas", en: "Tools" },
  description: null,
  image_url: null,
  position: 0,
  is_active: true,
};
const DRILLS = { ...TOOLS, id: 2, parent_id: 1, slug: "taladros", name: { es: "Taladros", en: "Drills" } };

function pageOf(items: unknown[]) {
  return { items, page: 1, size: 100, total: items.length, pages: 1 };
}

function serve(initial: unknown[]) {
  let categories = initial;
  server.use(http.get(CATEGORIES, () => HttpResponse.json(pageOf(categories))));
  return (next: unknown[]) => {
    categories = next;
  };
}

beforeEach(() => setCookie(CSRF_COOKIE, "token"));
afterEach(() => clearCookie(CSRF_COOKIE));

it("shows the tree with subcategories under their parent", async () => {
  serve([DRILLS, TOOLS]);
  renderWithProviders(<CategoriesView />, { hasSession: true });

  const rows = await screen.findAllByRole("row");
  expect(rows[1]).toHaveTextContent("Herramientas");
  expect(rows[2]).toHaveTextContent("Taladros");
  expect(within(rows[2]).getByText("Taladros")).toHaveClass("pl-4");
});

it("creates a subcategory", async () => {
  const update = serve([TOOLS]);
  let body: unknown;
  server.use(
    http.post(CATEGORIES, async ({ request }) => {
      body = await request.json();
      update([TOOLS, DRILLS]);
      return HttpResponse.json(DRILLS, { status: 201 });
    }),
  );
  renderWithProviders(<CategoriesView />, { hasSession: true });
  const user = userEvent.setup();

  await user.click(await screen.findByRole("button", { name: "Agregar categoría" }));
  const sheet = await screen.findByRole("dialog", { name: "Nueva categoría" });
  await user.type(within(sheet).getByLabelText("Slug"), "taladros");
  await user.type(within(sheet).getByLabelText("Nombre (español)"), "Taladros");
  await user.type(within(sheet).getByLabelText("Nombre (inglés)"), "Drills");
  await user.click(within(sheet).getByRole("combobox", { name: "Categoría padre" }));
  await user.click(await screen.findByRole("option", { name: "Herramientas" }));
  await user.click(within(sheet).getByRole("button", { name: "Guardar" }));

  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(body).toEqual({
    slug: "taladros",
    name: { es: "Taladros", en: "Drills" },
    description: null,
    parent_id: 1,
    position: 0,
    is_active: true,
  });
});

it("does not offer a category as its own parent, and only edits can take an image", async () => {
  serve([TOOLS, DRILLS]);
  renderWithProviders(<CategoriesView />, { hasSession: true });
  const user = userEvent.setup();

  await user.click(await screen.findByRole("button", { name: "Agregar categoría" }));
  expect(within(await screen.findByRole("dialog")).queryByLabelText("Imagen")).not.toBeInTheDocument();
  await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancelar" }));

  await user.click(await screen.findByRole("button", { name: "Editar taladros" }));
  const sheet = await screen.findByRole("dialog", { name: "Editar categoría" });
  expect(within(sheet).getByLabelText("Imagen")).toBeInTheDocument();
  await user.click(within(sheet).getByRole("combobox", { name: "Categoría padre" }));
  expect(await screen.findByRole("option", { name: "Herramientas" })).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: /Taladros/ })).not.toBeInTheDocument();
});

it.each([
  ["category_too_deep", "El árbol de categorías admite hasta 3 niveles."],
  ["active_children", "Primero desactivá sus subcategorías."],
  ["inactive_parent", "Una categoría activa necesita una categoría padre activa."],
])("explains %s in the form", async (code, message) => {
  serve([TOOLS]);
  server.use(http.patch(`${CATEGORIES}/1`, () => HttpResponse.json({ code, message: "Failed." }, { status: 422 })));
  renderWithProviders(<CategoriesView />, { hasSession: true });
  const user = userEvent.setup();

  await user.click(await screen.findByRole("button", { name: "Editar herramientas" }));
  const sheet = await screen.findByRole("dialog");
  await user.click(within(sheet).getByRole("button", { name: "Guardar" }));

  expect(await within(sheet).findByRole("alert")).toHaveTextContent(message);
});

it("puts a taken slug on its field", async () => {
  serve([TOOLS]);
  server.use(
    http.patch(`${CATEGORIES}/1`, () => HttpResponse.json({ code: "slug_taken", message: "Taken." }, { status: 409 })),
  );
  renderWithProviders(<CategoriesView />, { hasSession: true });
  const user = userEvent.setup();

  await user.click(await screen.findByRole("button", { name: "Editar herramientas" }));
  const sheet = await screen.findByRole("dialog");
  await user.click(within(sheet).getByRole("button", { name: "Guardar" }));

  expect(await within(sheet).findByText("Ese slug ya existe.")).toBeInTheDocument();
  expect(within(sheet).queryByRole("alert")).not.toBeInTheDocument();
});
