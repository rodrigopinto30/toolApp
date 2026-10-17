import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { CSRF_COOKIE } from "@/lib/api/cookies";
import { clearCookie, setCookie } from "@/test/cookies";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";

import { ResetPasswordForm } from "./reset-password-form";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), refresh: jest.fn() }),
}));

jest.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const ORIGIN = "https://localhost";

beforeEach(() => setCookie(CSRF_COOKIE, "token"));

afterEach(() => {
  clearCookie(CSRF_COOKIE);
  window.history.replaceState(null, "", "/es/reset-password");
});

it("sends the token of the link fragment and then removes it from the address bar", async () => {
  window.history.replaceState(null, "", "/es/reset-password#token=link-token-123");
  let body: unknown;
  server.use(
    http.post(`${ORIGIN}/api/v1/auth/reset-password`, async ({ request }) => {
      body = await request.json();
      return new HttpResponse(null, { status: 204 });
    }),
  );
  renderWithProviders(<ResetPasswordForm />);
  const user = userEvent.setup();

  await user.type(screen.getByLabelText("Nueva contraseña"), "a-new-long-password");
  await user.type(screen.getByLabelText("Repetí la contraseña"), "a-new-long-password");
  await user.click(screen.getByRole("button", { name: "Guardar contraseña" }));

  expect(await screen.findByText("Tu contraseña cambió y cerramos las demás sesiones.")).toBeInTheDocument();
  expect(body).toEqual({ token: "link-token-123", password: "a-new-long-password", locale: "es" });
  await waitFor(() => expect(window.location.hash).toBe(""));
});

it("explains that a link without token is not valid", () => {
  renderWithProviders(<ResetPasswordForm />);

  expect(screen.getByText("Este link no es válido. Pedí uno nuevo.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Pedir un link nuevo" })).toHaveAttribute("href", "/forgot-password");
});
