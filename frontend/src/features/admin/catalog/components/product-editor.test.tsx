import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { CSRF_COOKIE } from "@/lib/api/cookies";
import { ORIGIN } from "@/test/cart";
import { clearCookie, setCookie } from "@/test/cookies";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";

import { NewProductView, ProductEditor } from "./product-editor";

jest.mock("next/image", () => ({
  __esModule: true,
  default: jest.requireActual("@/test/next-image").TestImage,
}));

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

const ADMIN = `${ORIGIN}/api/v1/admin`;
const TEXT = { name: "Taladro", short_description: "Corto", description: "Largo", specs: { Potencia: "18 V" } };
const VARIANT = {
  id: 30,
  product_id: 5,
  sku: "TAL-18V",
  price_usd: "100.00",
  compare_at_price_usd: null,
  stock: 4,
  position: 0,
  is_active: true,
  version: 3,
  attribute_value_ids: [11],
  updated_at: "2026-10-29T15:00:00Z",
};
const IMAGE = {
  id: 70,
  product_id: 5,
  variant_id: null,
  url: "/media/products/5/a-1280.webp",
  alt: { es: "Frente", en: "Front" },
  position: 0,
  width: 800,
  height: 800,
};
const PRODUCT = {
  id: 5,
  slug: "taladro",
  brand_id: null,
  category_id: 3,
  is_active: true,
  is_featured: false,
  rating_avg: "0.00",
  rating_count: 0,
  translations: { es: TEXT, en: { ...TEXT, name: "Drill" } },
  variants: [VARIANT],
  images: [IMAGE, { ...IMAGE, id: 71, position: 1, alt: { es: "Lado", en: "Side" } }],
  created_at: "2026-10-29T15:00:00Z",
  updated_at: "2026-10-29T15:00:00Z",
};

function serve(initial: object = PRODUCT) {
  let product = initial;
  const page = (items: unknown[]) => ({ items, page: 1, size: 100, total: items.length, pages: 1 });
  server.use(
    http.get(`${ADMIN}/products/5`, () => HttpResponse.json(product)),
    http.get(`${ADMIN}/categories`, () =>
      HttpResponse.json(page([{ id: 3, parent_id: null, slug: "t", name: { es: "Taladros", en: "Drills" }, is_active: true }])),
    ),
    http.get(`${ADMIN}/brands`, () => HttpResponse.json(page([]))),
    http.get(`${ADMIN}/attributes`, () =>
      HttpResponse.json(
        page([
          {
            id: 1,
            code: "voltaje",
            name: { es: "Voltaje", en: "Voltage" },
            is_filterable: true,
            values: [{ id: 11, attribute_id: 1, slug: "18v", value: { es: "18 V", en: "18 V" }, position: 0 }],
          },
        ]),
      ),
    ),
  );
  return (next: object) => {
    product = next;
  };
}

function renderEditor() {
  renderWithProviders(<ProductEditor id={5} />, { hasSession: true });
  return userEvent.setup();
}

beforeEach(() => {
  setCookie(CSRF_COOKIE, "token");
  mockReplace.mockClear();
});
afterEach(() => clearCookie(CSRF_COOKIE));

it("shows an unknown product without breaking the page", async () => {
  server.use(http.get(`${ADMIN}/products/5`, () => HttpResponse.json({ code: "not_found" }, { status: 404 })));
  renderEditor();

  expect(await screen.findByText("Ese producto no existe.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Volver a productos" })).toHaveAttribute("href", "/admin/products");
});

it("loads the product in the form, with both languages and the specifications", async () => {
  serve();
  const user = renderEditor();

  expect(await screen.findByRole("heading", { level: 1, name: "Taladro" })).toBeInTheDocument();
  expect(screen.getByLabelText("Slug")).toHaveValue("taladro");
  expect(screen.getByRole("tabpanel", { name: "Español" })).toBeVisible();
  await user.click(screen.getByRole("tab", { name: "Inglés" }));
  expect(within(screen.getByRole("tabpanel", { name: "Inglés" })).getByLabelText("Nombre")).toHaveValue("Drill");
  expect(within(screen.getByRole("tabpanel", { name: "Inglés" })).getByLabelText("Especificaciones")).toHaveValue(
    "Potencia: 18 V",
  );
});

it("sends both languages and says it saved", async () => {
  serve();
  let body: Record<string, unknown> = {};
  server.use(
    http.patch(`${ADMIN}/products/5`, async ({ request }) => {
      body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json(PRODUCT);
    }),
  );
  const user = renderEditor();

  await user.click(await screen.findByRole("button", { name: "Guardar" }));

  expect(await screen.findByText("Guardamos los cambios.")).toBeInTheDocument();
  expect(body).toEqual({
    slug: "taladro",
    category_id: 3,
    brand_id: null,
    is_featured: false,
    translations: {
      es: { name: "Taladro", short_description: "Corto", description: "Largo", specs: { Potencia: "18 V" } },
      en: { name: "Drill", short_description: "Corto", description: "Largo", specs: { Potencia: "18 V" } },
    },
  });
});

it("opens the language with the error instead of failing silently", async () => {
  serve();
  const user = renderEditor();

  await user.click(await screen.findByRole("tab", { name: "Inglés" }));
  const name = within(screen.getByRole("tabpanel", { name: "Inglés" })).getByLabelText("Nombre");
  await user.clear(name);
  await user.click(screen.getByRole("tab", { name: "Español" }));
  await user.click(screen.getByRole("button", { name: "Guardar" }));

  await waitFor(() => expect(screen.getByRole("tab", { name: "Inglés" })).toHaveAttribute("aria-selected", "true"));
  expect(within(screen.getByRole("tabpanel", { name: "Inglés" })).getByText("Completá este campo.")).toBeVisible();
});

it("takes a new product to its page, where it can get variants", async () => {
  serve();
  server.use(http.post(`${ADMIN}/products`, () => HttpResponse.json(PRODUCT, { status: 201 })));
  renderWithProviders(<NewProductView />, { hasSession: true });
  const user = userEvent.setup();

  await user.type(screen.getByLabelText("Slug"), "taladro");
  await user.click(screen.getByRole("combobox", { name: "Categoría" }));
  await user.click(await screen.findByRole("option", { name: "Taladros" }));
  for (const name of ["Español", "Inglés"]) {
    await user.click(screen.getByRole("tab", { name }));
    const panel = within(screen.getByRole("tabpanel", { name }));
    await user.type(panel.getByLabelText("Nombre"), "Taladro");
    await user.type(panel.getByLabelText("Descripción corta"), "Corto");
    await user.type(panel.getByLabelText("Descripción"), "Largo");
  }
  await user.click(screen.getByRole("button", { name: "Guardar" }));

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/admin/products/5"));
});

it("archives after asking and offers to restore", async () => {
  const update = serve();
  server.use(
    http.post(`${ADMIN}/products/5/archive`, () => {
      update({ ...PRODUCT, is_active: false });
      return HttpResponse.json({ ...PRODUCT, is_active: false });
    }),
  );
  const user = renderEditor();

  await user.click(await screen.findByRole("button", { name: "Archivar" , description: undefined }));
  await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Sí, archivar" }));

  expect(await screen.findByRole("button", { name: "Restaurar" })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Ver en la tienda" })).not.toBeInTheDocument();
});

describe("variants", () => {
  it("shows each variant with its options", async () => {
    serve();
    renderEditor();

    const row = (await screen.findByText("TAL-18V")).closest("tr") as HTMLElement;
    await waitFor(() => expect(row).toHaveTextContent("18 V"));
    expect(row).toHaveTextContent("100,00");
  });

  it("sends the version, and never the stock, when editing", async () => {
    serve();
    let body: Record<string, unknown> = {};
    server.use(
      http.patch(`${ADMIN}/variants/30`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(VARIANT);
      }),
    );
    const user = renderEditor();

    await user.click(await screen.findByRole("button", { name: "Editar TAL-18V" }));
    const sheet = await screen.findByRole("dialog", { name: "Editar variante" });
    expect(within(sheet).queryByLabelText("Stock inicial")).not.toBeInTheDocument();
    await user.clear(within(sheet).getByLabelText("Precio en USD"));
    await user.type(within(sheet).getByLabelText("Precio en USD"), "120");
    await user.click(within(sheet).getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(body).toEqual({
      sku: "TAL-18V",
      price_usd: "120",
      compare_at_price_usd: null,
      position: 0,
      is_active: true,
      attribute_value_ids: [11],
      version: 3,
    });
  });

  it("reloads a stale form with the current values and saves with the new version", async () => {
    serve();
    const current = { ...VARIANT, price_usd: "150.00", version: 4 };
    const versions: unknown[] = [];
    server.use(
      http.patch(`${ADMIN}/variants/30`, async ({ request }) => {
        const body = (await request.json()) as { version: number };
        versions.push(body.version);
        return body.version === 3
          ? HttpResponse.json({ code: "version_conflict", message: "Stale.", details: current }, { status: 409 })
          : HttpResponse.json(current);
      }),
    );
    const user = renderEditor();

    await user.click(await screen.findByRole("button", { name: "Editar TAL-18V" }));
    const sheet = await screen.findByRole("dialog", { name: "Editar variante" });
    await user.clear(within(sheet).getByLabelText("Precio en USD"));
    await user.type(within(sheet).getByLabelText("Precio en USD"), "120");
    await user.click(within(sheet).getByRole("button", { name: "Guardar" }));

    expect(await within(sheet).findByRole("alert")).toHaveTextContent("Esta variante cambió mientras la editabas");
    expect(within(sheet).getByLabelText("Precio en USD")).toHaveValue("150.00");

    await user.click(within(sheet).getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(versions).toEqual([3, 4]);
  });

  it("creates a variant with its initial stock", async () => {
    serve({ ...PRODUCT, variants: [] });
    let body: unknown;
    server.use(
      http.post(`${ADMIN}/products/5/variants`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(VARIANT, { status: 201 });
      }),
    );
    const user = renderEditor();

    expect(await screen.findByText(/Sin variantes/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Agregar variante" }));
    const sheet = await screen.findByRole("dialog", { name: "Nueva variante" });
    await user.type(await within(sheet).findByLabelText("SKU"), "NUEVO-1");
    await user.type(within(sheet).getByLabelText("Precio en USD"), "50");
    await user.clear(within(sheet).getByLabelText("Stock inicial"));
    await user.type(within(sheet).getByLabelText("Stock inicial"), "9");
    await user.click(within(sheet).getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(body).toEqual({
      sku: "NUEVO-1",
      price_usd: "50",
      compare_at_price_usd: null,
      position: 0,
      is_active: true,
      stock: 9,
      attribute_value_ids: [],
    });
  });

  it("adjusts the stock with a reason and shows the new amount", async () => {
    const update = serve();
    let body: unknown;
    server.use(
      http.post(`${ADMIN}/variants/30/stock`, async ({ request }) => {
        body = await request.json();
        update({ ...PRODUCT, variants: [{ ...VARIANT, stock: 9 }] });
        return HttpResponse.json({ ...VARIANT, stock: 9 });
      }),
    );
    const user = renderEditor();

    await user.click(await screen.findByRole("button", { name: "Ajustar el stock de TAL-18V" }));
    const sheet = await screen.findByRole("dialog", { name: "Stock de TAL-18V" });
    expect(sheet).toHaveTextContent("Stock actual: 4.");
    await user.type(within(sheet).getByLabelText("Cambio"), "5");
    await user.type(within(sheet).getByLabelText("Motivo"), "Compra");
    await user.click(within(sheet).getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(body).toEqual({ delta: 5, reason: "Compra" });
    expect((await screen.findByText("TAL-18V")).closest("tr")).toHaveTextContent("9");
  });

  it("says how much stock there is when an adjustment goes below zero", async () => {
    serve();
    server.use(
      http.post(`${ADMIN}/variants/30/stock`, () =>
        HttpResponse.json({ code: "insufficient_stock", message: "No.", details: { stock: 4 } }, { status: 409 }),
      ),
    );
    const user = renderEditor();

    await user.click(await screen.findByRole("button", { name: "Ajustar el stock de TAL-18V" }));
    const sheet = await screen.findByRole("dialog");
    await user.type(within(sheet).getByLabelText("Cambio"), "-9");
    await user.type(within(sheet).getByLabelText("Motivo"), "Rotura");
    await user.click(within(sheet).getByRole("button", { name: "Guardar" }));

    expect(await within(sheet).findByRole("alert")).toHaveTextContent("quedan 4 unidades");
  });
});

describe("images", () => {
  it("lists the images in order and blocks moves past the ends", async () => {
    serve();
    renderEditor();

    const up = await screen.findByRole("button", { name: "Subir Imagen 1" });
    expect(up).toBeDisabled();
    expect(screen.getByRole("button", { name: "Bajar Imagen 2" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Subir Imagen 2" })).toBeEnabled();
  });

  it("swaps two images with the keyboard buttons", async () => {
    const update = serve();
    const bodies: [string, unknown][] = [];
    server.use(
      http.patch(`${ADMIN}/images/:id`, async ({ params, request }) => {
        bodies.push([String(params.id), await request.json()]);
        update({
          ...PRODUCT,
          images: [
            { ...PRODUCT.images[1], position: 0 },
            { ...PRODUCT.images[0], position: 1 },
          ],
        });
        return HttpResponse.json(IMAGE);
      }),
    );
    const user = renderEditor();

    await user.click(await screen.findByRole("button", { name: "Bajar Imagen 1" }));

    await waitFor(() =>
      expect(bodies).toEqual([
        ["71", { position: 0 }],
        ["70", { position: 1 }],
      ]),
    );
    await waitFor(() => expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("Lado"));
  });

  it("uploads a file and shows the server's list", async () => {
    const update = serve();
    let contentType = "";
    let hasFile = false;
    server.use(
      http.post(`${ADMIN}/products/5/images`, async ({ request }) => {
        contentType = request.headers.get("content-type") ?? "";
        hasFile = (await request.formData()).has("file");
        update({ ...PRODUCT, images: [...PRODUCT.images, { ...IMAGE, id: 72, position: 2, alt: null }] });
        return HttpResponse.json(IMAGE, { status: 201 });
      }),
    );
    renderEditor();

    fireEvent.change(await screen.findByLabelText("Subir una imagen"), {
      target: { files: [new File(["x"], "nueva.png", { type: "image/png" })] },
    });

    expect(await screen.findByText("Imagen 3")).toBeInTheDocument();
    expect(contentType).toMatch(/^multipart\/form-data; boundary=/);
    expect(hasFile).toBe(true);
  });

  it("stops uploads at 12 images", async () => {
    serve({ ...PRODUCT, images: Array.from({ length: 12 }, (_, index) => ({ ...IMAGE, id: 100 + index, position: index })) });
    renderEditor();

    expect(await screen.findByLabelText("Subir una imagen")).toBeDisabled();
  });

  it("edits the alternative text and the variant", async () => {
    serve();
    let body: unknown;
    server.use(
      http.patch(`${ADMIN}/images/70`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(IMAGE);
      }),
    );
    const user = renderEditor();

    await user.click(await screen.findByRole("button", { name: "Editar Imagen 1" }));
    const sheet = await screen.findByRole("dialog", { name: "Editar imagen" });
    await user.clear(within(sheet).getByLabelText("Texto alternativo (español)"));
    await user.type(within(sheet).getByLabelText("Texto alternativo (español)"), "Vista frontal");
    await user.click(within(sheet).getByRole("combobox", { name: "Variante" }));
    await user.click(await screen.findByRole("option", { name: "TAL-18V" }));
    await user.click(within(sheet).getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(body).toEqual({ alt: { es: "Vista frontal", en: "Front" }, variant_id: 30 });
  });

  it("deletes after asking", async () => {
    const update = serve();
    server.use(
      http.delete(`${ADMIN}/images/70`, () => {
        update({ ...PRODUCT, images: [PRODUCT.images[1]] });
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = renderEditor();

    await user.click(await screen.findByRole("button", { name: "Eliminar Imagen 1" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Sí, eliminar" }));

    await waitFor(() => expect(screen.queryByText("Frente")).not.toBeInTheDocument());
  });
});
