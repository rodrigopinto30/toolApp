import { screen, within } from "@testing-library/react";

import { renderWithUrl } from "@/test/render";

import { AccountNav } from "./account-nav";

let pathname = "/account";

jest.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  usePathname: () => pathname,
}));

it("marks the section of the current page, an order included", () => {
  pathname = "/account/orders/TA-2026-000001";
  renderWithUrl(<AccountNav />);

  const nav = screen.getByRole("navigation", { name: "Secciones de la cuenta" });
  const current = within(nav)
    .getAllByRole("link")
    .filter((link) => link.getAttribute("aria-current") === "page");
  expect(current.map((link) => link.textContent)).toEqual(["Mis pedidos"]);
  expect(current[0]).toHaveAttribute("data-variant", "selected");
});
