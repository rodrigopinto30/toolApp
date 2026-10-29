import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UrlUpdateEvent } from "nuqs/adapters/testing";

import { renderWithUrl } from "@/test/render";

import { ListingProvider } from "./listing-provider";
import { SortSelect } from "./sort-select";

function renderSort(hasQuery: boolean, searchParams = "") {
  const updates: UrlUpdateEvent[] = [];
  renderWithUrl(
    <ListingProvider>
      <SortSelect hasQuery={hasQuery} />
    </ListingProvider>,
    { searchParams, onUrlUpdate: (event) => updates.push(event) },
  );
  return updates;
}

it("offers relevance only for a search and starts from the default order", async () => {
  renderSort(false);
  const user = userEvent.setup();
  const trigger = screen.getByRole("combobox", { name: "Ordenar por" });

  expect(trigger).toHaveTextContent("Más nuevos");
  await user.click(trigger);
  expect(await screen.findByRole("option", { name: "Menor precio" })).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "Más relevantes" })).not.toBeInTheDocument();
});

it("writes the order to the URL, resets the page and leaves the default out", async () => {
  const updates = renderSort(true, "?q=taladro&page=2");
  const user = userEvent.setup();
  const trigger = screen.getByRole("combobox", { name: "Ordenar por" });

  expect(trigger).toHaveTextContent("Más relevantes");
  await user.click(trigger);
  await user.click(await screen.findByRole("option", { name: "Menor precio" }));
  await waitFor(() => expect(updates.at(-1)?.queryString).toBe("?q=taladro&sort=price_asc"));
  expect(trigger).toHaveTextContent("Menor precio");

  await user.click(trigger);
  await user.click(await screen.findByRole("option", { name: "Más relevantes" }));
  await waitFor(() => expect(updates.at(-1)?.queryString).toBe("?q=taladro"));
});
