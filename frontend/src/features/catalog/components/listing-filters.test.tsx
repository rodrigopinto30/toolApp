import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UrlUpdateEvent } from "nuqs/adapters/testing";

import { renderWithUrl } from "@/test/render";

import { ListingFilters } from "./listing-filters";
import { ListingProvider } from "./listing-provider";

const GROUPS = [
  { param: "brand" as const, key: "brand", title: null, options: [{ value: "bosch", label: "Bosch", count: 4 }] },
  {
    param: "attr" as const,
    key: "voltage",
    title: "Voltaje",
    options: [{ value: "voltage:18v", label: "18V", count: 2 }],
  },
];
const PRICE_RANGE = {
  min: { amount: "5075", currency: "ARS" as const },
  max: { amount: "274050", currency: "ARS" as const },
};

function renderFilters(searchParams = "?page=3") {
  const updates: UrlUpdateEvent[] = [];
  renderWithUrl(
    <ListingProvider>
      <ListingFilters groups={GROUPS} priceRange={PRICE_RANGE} currency="ARS" />
    </ListingProvider>,
    { searchParams, onUrlUpdate: (event) => updates.push(event) },
  );
  return { updates, user: userEvent.setup() };
}

it("adds a value to the URL, renders on the server and goes back to the first page", async () => {
  const { updates, user } = renderFilters();

  await user.click(screen.getByRole("checkbox", { name: "Bosch (4)" }));
  await user.click(screen.getByRole("checkbox", { name: "18V (2)" }));

  await waitFor(() => expect(updates.at(-1)?.queryString).toBe("?brand=bosch&attr=voltage:18v"));
  expect(updates.at(-1)?.options).toMatchObject({ shallow: false, history: "push" });
  expect(screen.getByRole("group", { name: "Marca" })).toBeInTheDocument();
});

it("updates the price range after the user stops typing and ignores invalid input", async () => {
  const { updates, user } = renderFilters("");
  const min = screen.getByRole("textbox", { name: "Precio mínimo" });

  expect(min).toHaveAttribute("placeholder", "5075");
  await user.type(min, "10a0.5x");

  expect(min).toHaveValue("100.5");
  await waitFor(() => expect(updates.at(-1)?.queryString).toBe("?min=100.5"));
});

it("clears every filter but keeps the query and the sort", async () => {
  const { updates, user } = renderFilters("?q=taladro&sort=name&brand=bosch&stock=true&min=10");

  await user.click(screen.getByRole("button", { name: "Limpiar filtros" }));

  await waitFor(() => expect(updates.at(-1)?.queryString).toBe("?q=taladro&sort=name"));
});

it("offers 'clear filters' only when there is a filter", () => {
  renderFilters("?q=taladro");

  expect(screen.queryByRole("button", { name: "Limpiar filtros" })).not.toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: "Solo con stock" })).not.toBeChecked();
});
