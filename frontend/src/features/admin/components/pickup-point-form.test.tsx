import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { CSRF_COOKIE } from "@/lib/api/cookies";
import { ORIGIN } from "@/test/cart";
import { clearCookie, setCookie } from "@/test/cookies";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";

import { mergeHours, PickupPointForm } from "./pickup-point-form";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}));

const POINTS = `${ORIGIN}/api/v1/admin/pickup-points`;

beforeEach(() => setCookie(CSRF_COOKIE, "token"));
afterEach(() => clearCookie(CSRF_COOKIE));

describe("mergeHours", () => {
  it("keeps only the days that were filled in", () => {
    expect(mergeHours({ mon_fri: "9 a 18", sat: "", sun: "" }, null)).toEqual({ mon_fri: "9 a 18" });
  });

  it("gives no hours when every day is empty", () => {
    expect(mergeHours({ mon_fri: "", sat: "", sun: "" }, { sat: "9 a 13" })).toBeNull();
  });

  it("does not lose a day the form does not show", () => {
    expect(mergeHours({ mon_fri: "9 a 18", sat: "", sun: "" }, { feriados: "cerrado", sat: "9 a 13" })).toEqual({
      feriados: "cerrado",
      mon_fri: "9 a 18",
    });
  });
});

it("sends a new point without hours as null", async () => {
  let body: unknown;
  server.use(
    http.post(POINTS, async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({ id: 1 }, { status: 201 });
    }),
  );
  const onSaved = jest.fn();
  renderWithProviders(<PickupPointForm onSaved={onSaved} onCancel={jest.fn()} />, { hasSession: true });
  const user = userEvent.setup();

  await user.type(screen.getByLabelText("Nombre"), "Local Centro");
  await user.type(screen.getByLabelText("Dirección"), "Florida 100");
  await user.click(await screen.findByRole("button", { name: "Guardar" }));

  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  expect(body).toEqual({ name: "Local Centro", address: "Florida 100", hours: null, is_active: true });
});
