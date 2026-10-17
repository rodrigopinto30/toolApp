import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { CSRF_COOKIE } from "@/lib/api/cookies";
import { clearCookie, setCookie } from "@/test/cookies";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";

import { ProfileForm } from "./profile-form";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), refresh: jest.fn() }),
}));

const ORIGIN = "https://localhost";
const ME = {
  id: 1,
  email: "ana@example.com",
  first_name: "Ana",
  last_name: "Diaz",
  phone: "1155555555",
  role: "customer" as const,
  email_verified: true,
  created_at: "2026-10-17T00:00:00Z",
};

beforeEach(() => setCookie(CSRF_COOKIE, "token"));

afterEach(() => clearCookie(CSRF_COOKIE));

it("saves the changes, sends an empty phone as null and can be edited again", async () => {
  const bodies: unknown[] = [];
  server.use(
    http.patch(`${ORIGIN}/api/v1/me`, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      bodies.push(body);
      return HttpResponse.json({ ...ME, ...body });
    }),
  );
  renderWithProviders(<ProfileForm me={ME} />, { hasSession: true });
  const user = userEvent.setup();
  const save = screen.getByRole("button", { name: "Guardar cambios" });

  expect(save).toBeDisabled();
  await user.clear(screen.getByLabelText("Teléfono"));
  await user.click(save);

  expect(await screen.findByText("Guardamos tus datos.")).toBeInTheDocument();
  expect(bodies).toEqual([{ first_name: "Ana", last_name: "Diaz", phone: null }]);
  expect(save).toBeDisabled();

  await user.type(screen.getByLabelText("Apellido"), "z");

  expect(save).toBeEnabled();
  expect(screen.queryByText("Guardamos tus datos.")).not.toBeInTheDocument();
});

it("rejects an invalid phone before calling the API", async () => {
  renderWithProviders(<ProfileForm me={ME} />, { hasSession: true });
  const user = userEvent.setup();

  await user.clear(screen.getByLabelText("Teléfono"));
  await user.type(screen.getByLabelText("Teléfono"), "call me");
  await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

  expect(await screen.findByText("Ingresá un teléfono válido.")).toBeInTheDocument();
});
