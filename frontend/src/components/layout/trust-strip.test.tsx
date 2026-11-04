import { screen } from "@testing-library/react";

import { renderWithUrl } from "@/test/render";

import { TrustStrip } from "./trust-strip";

it("lists what the store offers", () => {
  renderWithUrl(<TrustStrip />);

  expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
    "Envío a todo el país",
    "Retiro en el local",
    "Precios en pesos o dólares",
  ]);
});
