import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { CSRF_COOKIE } from "@/lib/api/cookies";
import { ORIGIN } from "@/test/cart";
import { clearCookie, setCookie } from "@/test/cookies";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";

import { BrandsView } from "./brands-view";

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

const BRANDS = `${ORIGIN}/api/v1/admin/brands`;
const BOSCH = { id: 1, slug: "bosch", name: "Bosch", logo_url: null, is_active: true };
const LOGO = "/media/brands/1/logo-1280.webp";

function serve() {
  let brand = BOSCH;
  const calls: string[] = [];
  server.use(
    http.get(BRANDS, () => HttpResponse.json({ items: [brand], page: 1, size: 100, total: 1, pages: 1 })),
    http.post(`${BRANDS}/1/logo`, async ({ request }) => {
      const form = await request.formData();
      calls.push(form.has("file") ? "upload" : "no file");
      brand = { ...brand, logo_url: LOGO as never };
      return HttpResponse.json(brand);
    }),
    http.delete(`${BRANDS}/1/logo`, () => {
      calls.push("remove");
      brand = { ...BOSCH };
      return HttpResponse.json(brand);
    }),
  );
  return calls;
}

beforeEach(() => setCookie(CSRF_COOKIE, "token"));
afterEach(() => clearCookie(CSRF_COOKIE));

it("uploads a logo as a file, shows the server's result and removes it", async () => {
  const calls = serve();
  renderWithProviders(<BrandsView />, { hasSession: true });
  const user = userEvent.setup();

  await user.click(await screen.findByRole("button", { name: "Editar Bosch" }));
  const sheet = await screen.findByRole("dialog", { name: "Editar marca" });
  fireEvent.change(within(sheet).getByLabelText("Logo"), {
    target: { files: [new File(["x"], "logo.png", { type: "image/png" })] },
  });

  expect(await within(sheet).findByRole("img", { name: "Bosch" })).toBeInTheDocument();
  expect(calls).toEqual(["upload"]);

  await user.click(within(sheet).getByRole("button", { name: "Quitar la imagen" }));

  await waitFor(() => expect(within(sheet).queryByRole("img")).not.toBeInTheDocument());
  expect(calls).toEqual(["upload", "remove"]);
});

it("explains why a brand in use stays", async () => {
  serve();
  server.use(
    http.delete(`${BRANDS}/1`, () => HttpResponse.json({ code: "in_use", message: "In use." }, { status: 409 })),
  );
  renderWithProviders(<BrandsView />, { hasSession: true });
  const user = userEvent.setup();

  await user.click(await screen.findByRole("button", { name: "Eliminar Bosch" }));
  await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Sí, eliminar" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Está en uso");
});
