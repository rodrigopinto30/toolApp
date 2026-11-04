import { render, screen } from "@testing-library/react";

import { StepHeading } from "./step-heading";

it("shows the step number without adding it to the heading name", () => {
  render(
    <StepHeading id="delivery" step={1}>
      Entrega
    </StepHeading>,
  );

  const heading = screen.getByRole("heading", { level: 2, name: "Entrega" });
  expect(heading).toHaveAttribute("id", "delivery");
  expect(heading).toHaveTextContent("1Entrega");
});
