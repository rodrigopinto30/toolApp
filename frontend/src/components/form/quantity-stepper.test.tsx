import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { QuantityStepper } from "./quantity-stepper";

const changes = jest.fn();

function Stepper({ initial = 2 }: { initial?: number }) {
  const [value, setValue] = useState(initial);
  return (
    <QuantityStepper
      id="quantity"
      label="Cantidad"
      decreaseLabel="Restar"
      increaseLabel="Sumar"
      value={value}
      max={5}
      onValueChange={(next) => {
        changes(next);
        setValue(next);
      }}
    />
  );
}

beforeEach(() => changes.mockClear());

it("steps within the bounds", async () => {
  const user = userEvent.setup();
  render(<Stepper initial={4} />);

  await user.click(screen.getByRole("button", { name: "Sumar" }));

  expect(screen.getByRole("spinbutton", { name: "Cantidad" })).toHaveValue(5);
  expect(screen.getByRole("button", { name: "Sumar" })).toBeDisabled();
  expect(changes).toHaveBeenCalledWith(5);
});

it("commits a typed value on blur or Enter, clamped to the bounds", async () => {
  const user = userEvent.setup();
  render(<Stepper />);
  const input = screen.getByRole("spinbutton", { name: "Cantidad" });

  await user.clear(input);
  await user.type(input, "9{Enter}");
  expect(input).toHaveValue(5);

  await user.clear(input);
  await user.type(input, "3");
  expect(changes).toHaveBeenCalledTimes(1);
  await user.tab();

  expect(changes).toHaveBeenLastCalledWith(3);
});

it("restores the value when the field is left empty", async () => {
  const user = userEvent.setup();
  render(<Stepper />);
  const input = screen.getByRole("spinbutton", { name: "Cantidad" });

  await user.clear(input);
  await user.tab();

  expect(input).toHaveValue(2);
  expect(changes).not.toHaveBeenCalled();
});
