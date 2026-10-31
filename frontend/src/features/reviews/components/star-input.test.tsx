import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { renderWithProviders } from "@/test/render";

import { StarInput } from "./star-input";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}));

function Controlled({ onChange = () => undefined }: { onChange?: (value: number) => void }) {
  const [value, setValue] = useState(0);
  return (
    <StarInput
      id="rating"
      name="rating"
      legend="Puntaje"
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

it("groups five named radio buttons under the legend", () => {
  renderWithProviders(<Controlled />);

  expect(screen.getByRole("group", { name: "Puntaje" })).toBeInTheDocument();
  expect(screen.getAllByRole("radio").map((radio) => radio.parentElement?.textContent)).toEqual([
    "1 estrella",
    "2 estrellas",
    "3 estrellas",
    "4 estrellas",
    "5 estrellas",
  ]);
});

it("chooses a rating with the pointer", async () => {
  const onChange = jest.fn();
  renderWithProviders(<Controlled onChange={onChange} />);

  await userEvent.setup().click(screen.getByRole("radio", { name: "4 estrellas" }));

  expect(onChange).toHaveBeenCalledWith(4);
  expect(screen.getByRole("radio", { name: "4 estrellas" })).toBeChecked();
});

it("moves with the arrow keys", async () => {
  const user = userEvent.setup();
  renderWithProviders(<Controlled />);

  await user.click(screen.getByRole("radio", { name: "2 estrellas" }));
  await user.keyboard("{ArrowRight}");

  expect(screen.getByRole("radio", { name: "3 estrellas" })).toBeChecked();
});

it("ties the error to the group", () => {
  renderWithProviders(
    <StarInput id="rating" name="rating" legend="Puntaje" value={0} error="Elegí un puntaje." onChange={jest.fn()} />,
  );

  expect(screen.getByRole("group", { name: "Puntaje" })).toHaveAccessibleDescription("Elegí un puntaje.");
});
