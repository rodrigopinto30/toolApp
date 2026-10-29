import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UrlUpdateEvent } from "nuqs/adapters/testing";

import type { Variant } from "@/features/catalog/variants";
import { renderWithUrl } from "@/test/render";

import { VariantSelector } from "./variant-selector";
import { VariantSummary } from "./variant-summary";

const VARIANTS: Variant[] = [
  {
    id: 1,
    sku: "STA-TM-5M",
    price: { amount: "11455", currency: "ARS" },
    compare_at: null,
    stock_status: "out_of_stock",
    attributes: [{ code: "size", name: "Medida", value_slug: "5m", value: "5 m" }],
  },
  {
    id: 2,
    sku: "STA-TM-8M",
    price: { amount: "15805", currency: "ARS" },
    compare_at: { amount: "17000", currency: "ARS" },
    stock_status: "in_stock",
    attributes: [{ code: "size", name: "Medida", value_slug: "8m", value: "8 m" }],
  },
];

function renderVariants(searchParams = "") {
  const updates: UrlUpdateEvent[] = [];
  renderWithUrl(
    <>
      <VariantSummary variants={VARIANTS} />
      <VariantSelector variants={VARIANTS} />
    </>,
    { searchParams, onUrlUpdate: (event) => updates.push(event) },
  );
  return updates;
}

it("starts from the first variant in stock and marks the ones without stock", () => {
  renderVariants();

  expect(screen.getByRole("radio", { name: "8 m" })).toBeChecked();
  expect(screen.getByRole("radio", { name: "5 m (sin stock)" })).not.toBeChecked();
  expect(screen.getByText("SKU: STA-TM-8M")).toBeInTheDocument();
  expect(screen.getByText(/\$\s?15\.805/)).toBeInTheDocument();
});

it("updates the price, the stock and the SKU without a server request and keeps the choice in the URL", async () => {
  const updates = renderVariants();
  const user = userEvent.setup();

  await user.click(screen.getByRole("radio", { name: "5 m (sin stock)" }));

  expect(screen.getByText("SKU: STA-TM-5M")).toBeInTheDocument();
  expect(screen.getByText(/\$\s?11\.455/)).toBeInTheDocument();
  expect(screen.getByText("Sin stock")).toBeInTheDocument();
  await waitFor(() => expect(updates.at(-1)?.queryString).toBe("?variant=STA-TM-5M"));
  expect(updates.at(-1)?.options.shallow).toBe(true);
});

it("opens the variant named in the URL", () => {
  renderVariants("?variant=STA-TM-5M");

  expect(screen.getByRole("radio", { name: "5 m (sin stock)" })).toBeChecked();
  expect(screen.getByText("SKU: STA-TM-5M")).toBeInTheDocument();
});
