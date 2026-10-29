import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";

import { cartLine } from "@/test/cart";
import { renderWithProviders } from "@/test/render";
import type { CartAdjustment } from "@/stores/guest-cart";
import { useGuestCartStore } from "@/stores/store-provider";

import { MergeNotice } from "./merge-notice";

jest.mock("next/navigation", () => ({ useRouter: () => ({ replace: jest.fn(), refresh: jest.fn() }) }));

function WithAdjustments({ adjustments }: { adjustments: CartAdjustment[] }) {
  const store = useGuestCartStore();
  useEffect(() => store.getState().setAdjustments(adjustments), [store, adjustments]);
  return <MergeNotice lines={[cartLine({ variant_id: 30, quantity: 4 })]} />;
}

it("explains every adjustment of the merge until it is dismissed", async () => {
  const user = userEvent.setup();
  renderWithProviders(
    <WithAdjustments
      adjustments={[
        { variant_id: 30, requested: 9, applied: 4, reason: "insufficient_stock" },
        { variant_id: 12, requested: 1, applied: 0, reason: "unavailable" },
        { variant_id: 13, requested: 2, applied: 0, reason: "cart_limit" },
      ]}
    />,
  );

  expect(await screen.findByText("Sumamos a tu cuenta los productos que habías elegido")).toBeInTheDocument();
  expect(
    screen.getByText("Tarugos de nylon (100 u.): quedaron 4 unidades de las 9 que pediste."),
  ).toBeInTheDocument();
  expect(screen.getByText("Uno de los productos ya no está disponible.")).toBeInTheDocument();
  expect(
    screen.getByText("Un producto no entró porque el carrito llegó al máximo de productos."),
  ).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Entendido" }));

  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
