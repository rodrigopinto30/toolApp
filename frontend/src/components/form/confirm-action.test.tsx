import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ConfirmAction } from "./confirm-action";

function renderAction(props: Partial<React.ComponentProps<typeof ConfirmAction>> = {}) {
  const onConfirm = jest.fn();
  render(
    <ConfirmAction
      label="Eliminar"
      title="¿Eliminar Casa?"
      description="No se puede deshacer."
      confirmLabel="Sí, eliminar"
      pendingLabel="Eliminando…"
      cancelLabel="Conservar"
      pending={false}
      onConfirm={onConfirm}
      {...props}
    />,
  );
  return { onConfirm, user: userEvent.setup() };
}

it("asks first, and does nothing when the customer backs out", async () => {
  const { onConfirm, user } = renderAction();

  await user.click(screen.getByRole("button", { name: "Eliminar" }));
  const dialog = await screen.findByRole("alertdialog", { name: "¿Eliminar Casa?" });
  await user.click(within(dialog).getByRole("button", { name: "Conservar" }));

  expect(onConfirm).not.toHaveBeenCalled();
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
});

it("hands over a function that closes the dialog", async () => {
  const { onConfirm, user } = renderAction();

  await user.click(screen.getByRole("button", { name: "Eliminar" }));
  await user.click(await screen.findByRole("button", { name: "Sí, eliminar" }));
  expect(screen.getByRole("alertdialog")).toBeInTheDocument();

  act(() => onConfirm.mock.calls[0][0]());

  expect(await screen.findByRole("button", { name: "Eliminar" })).toBeInTheDocument();
});

it("locks the dialog while the action runs", async () => {
  const { user } = renderAction({ pending: true });

  await user.click(screen.getByRole("button", { name: "Eliminar" }));

  expect(await screen.findByRole("button", { name: "Eliminando…" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Conservar" })).toBeDisabled();
});

it("gives the trigger a name of its own when a list repeats it", () => {
  renderAction({ accessibleLabel: "Eliminar Casa" });

  expect(screen.getByRole("button", { name: "Eliminar Casa" })).toHaveTextContent("Eliminar");
});
