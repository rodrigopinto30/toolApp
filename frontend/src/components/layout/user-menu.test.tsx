import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { ORIGIN } from "@/test/cart";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";

import { UserMenu } from "./user-menu";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}));

jest.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

async function openMenu(role: string) {
  server.use(
    http.get(`${ORIGIN}/api/v1/me`, () =>
      HttpResponse.json({ id: 1, first_name: "Ana", last_name: "Diaz", email: "ana@example.com", role }),
    ),
  );
  renderWithProviders(<UserMenu />, { hasSession: true });
  await userEvent.setup().click(await screen.findByRole("button", { name: "Menú de la cuenta" }));
  await screen.findByRole("menuitem", { name: "Mi cuenta" });
}

it("links an admin to the panel", async () => {
  await openMenu("admin");

  expect(screen.getByRole("menuitem", { name: "Panel de administración" })).toHaveAttribute("href", "/admin");
});

it("does not show the panel to a customer", async () => {
  await openMenu("customer");

  expect(screen.queryByRole("menuitem", { name: "Panel de administración" })).not.toBeInTheDocument();
});
