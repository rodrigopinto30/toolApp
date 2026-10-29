import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";

import { CurrencySwitcher } from "./currency-switcher";

const refresh = jest.fn();
const replace = jest.fn();
let search = "";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, replace }),
  usePathname: () => "/es/categories/drills",
  useSearchParams: () => new URLSearchParams(search),
}));

beforeEach(() => {
  refresh.mockClear();
  replace.mockClear();
  document.cookie = "currency=; Max-Age=0; Path=/";
});

async function chooseDollars() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Moneda" }));
  await user.click(await screen.findByRole("menuitem", { name: "Dólares (USD)" }));
}

it("stores the currency and renders the page again", async () => {
  search = "brand=bosch";
  renderWithProviders(<CurrencySwitcher value="ARS" />);

  await chooseDollars();

  expect(document.cookie).toContain("currency=USD");
  expect(refresh).toHaveBeenCalled();
  expect(replace).not.toHaveBeenCalled();
});

it("drops a price range typed in the other currency", async () => {
  search = "brand=bosch&min=1000&max=5000&page=2";
  renderWithProviders(<CurrencySwitcher value="ARS" />);

  await chooseDollars();

  expect(replace).toHaveBeenCalledWith("/es/categories/drills?brand=bosch", { scroll: false });
  expect(refresh).toHaveBeenCalled();
});
