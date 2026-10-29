import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";

import { SearchBox } from "./search-box";

const push = jest.fn();
let pathname = "/";
let search = "";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn() }),
  useSearchParams: () => new URLSearchParams(search),
}));

jest.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => pathname,
}));

beforeEach(() => {
  push.mockClear();
  pathname = "/";
  search = "";
});

it("is a plain GET form to the localized search page", () => {
  renderWithProviders(<SearchBox />);

  const form = screen.getByRole("search");
  expect(form).toHaveAttribute("action", "/es/search");
  expect(form).toHaveAttribute("method", "get");
  expect(screen.getByRole("searchbox", { name: "Buscar productos" })).toHaveAttribute("name", "q");
});

it("navigates to the search page once hydrated", async () => {
  renderWithProviders(<SearchBox />);
  const user = userEvent.setup();

  await user.type(screen.getByRole("searchbox"), "  taladro {enter}");

  expect(push).toHaveBeenCalledWith({ pathname: "/search", query: { q: "taladro" } });
});

it("shows the current query only on the search page", () => {
  search = "q=amoladora";
  pathname = "/search";
  const { unmount } = renderWithProviders(<SearchBox />);
  expect(screen.getByRole("searchbox")).toHaveValue("amoladora");
  unmount();

  pathname = "/categories/drills";
  renderWithProviders(<SearchBox />);
  expect(screen.getByRole("searchbox")).toHaveValue("");
});
