import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";

import { SubmitButton } from "./submit-button";

it("stays disabled in the server HTML so the browser cannot submit the form natively", () => {
  const container = document.createElement("div");
  container.innerHTML = renderToString(<SubmitButton pendingLabel="Sending…">Send</SubmitButton>);

  expect(container.querySelector("button")).toBeDisabled();
});

it("is enabled once hydrated and shows the pending label while submitting", () => {
  const { rerender } = render(<SubmitButton pendingLabel="Sending…">Send</SubmitButton>);

  expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();

  rerender(
    <SubmitButton pending pendingLabel="Sending…">
      Send
    </SubmitButton>,
  );

  expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();
});
