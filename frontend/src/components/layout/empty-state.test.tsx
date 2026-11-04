import { render, screen } from "@testing-library/react";
import { ShoppingCartIcon } from "lucide-react";

import { EmptyState } from "./empty-state";

it("titles the state, explains it and offers the next step", () => {
  render(
    <EmptyState
      icon={ShoppingCartIcon}
      title="Tu carrito está vacío"
      description="Explorá el catálogo."
      action={<button type="button">Ir al inicio</button>}
    />,
  );

  expect(screen.getByRole("heading", { level: 2, name: "Tu carrito está vacío" })).toBeInTheDocument();
  expect(screen.getByText("Explorá el catálogo.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Ir al inicio" })).toBeInTheDocument();
});

it("adds no heading when it only has a sentence", () => {
  render(<EmptyState description="Todavía no guardaste ninguna dirección." />);

  expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  expect(screen.getByText("Todavía no guardaste ninguna dirección.")).toBeInTheDocument();
});
