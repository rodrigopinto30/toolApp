import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { CSRF_COOKIE } from "@/lib/api/cookies";
import { clearCookie, setCookie } from "@/test/cookies";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";

import { LoginForm } from "./login-form";

const replace = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh: jest.fn() }),
}));

jest.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const ORIGIN = "https://localhost";

beforeEach(() => {
  replace.mockClear();
  localStorage.clear();
  setCookie(CSRF_COOKIE, "token");
});

afterEach(() => clearCookie(CSRF_COOKIE));

async function submit(email: string, password: string) {
  const user = userEvent.setup();
  if (email) await user.type(screen.getByLabelText("Email"), email);
  if (password) await user.type(screen.getByLabelText("Contraseña"), password);
  await user.click(screen.getByRole("button", { name: "Ingresar" }));
}

it("validates the fields before calling the API", async () => {
  renderWithProviders(<LoginForm next="/es/account" />);

  await submit("", "");

  expect(await screen.findAllByText("Completá este campo.")).toHaveLength(2);
  expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
});

it("shows the translated error of wrong credentials", async () => {
  server.use(
    http.post(`${ORIGIN}/api/v1/auth/login`, () =>
      HttpResponse.json({ code: "invalid_credentials", message: "Invalid email or password." }, { status: 401 }),
    ),
  );
  renderWithProviders(<LoginForm next="/es/account" />);

  await submit("ana@example.com", "wrong-password");

  expect(await screen.findByRole("alert")).toHaveTextContent("Email o contraseña incorrectos.");
  expect(replace).not.toHaveBeenCalled();
});

it("disables the button while locked out", async () => {
  server.use(
    http.post(`${ORIGIN}/api/v1/auth/login`, () =>
      HttpResponse.json(
        { code: "account_locked", message: "x" },
        { status: 429, headers: { "Retry-After": "120" } },
      ),
    ),
  );
  renderWithProviders(<LoginForm next="/es/account" />);

  await submit("ana@example.com", "a-long-password");

  expect(await screen.findByRole("alert")).toHaveTextContent("Probá de nuevo en 2 minutos.");
  expect(screen.getByRole("button", { name: "Ingresar" })).toBeDisabled();
});

it("sends the normalized email and goes to the next page", async () => {
  let body: unknown;
  server.use(
    http.post(`${ORIGIN}/api/v1/auth/login`, async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({ id: 1, email: "ana@example.com", first_name: "Ana" });
    }),
  );
  renderWithProviders(<LoginForm next="/es/products/drill" />);

  await submit("  Ana@Example.com ", "a-long-password");

  await screen.findByRole("button", { name: "Ingresando…" }).catch(() => undefined);
  expect(body).toEqual({ email: "ana@example.com", password: "a-long-password" });
  expect(replace).toHaveBeenCalledWith("/es/products/drill");
});
