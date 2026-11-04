import { render, screen } from "@testing-library/react";

import { StatusTimeline } from "./status-timeline";

it("lists the changes in order, one entry each", () => {
  render(
    <StatusTimeline items={["Pago pendiente", "Pagado", "Enviado"]} itemKey={(item) => item}>
      {(item) => <span>{item}</span>}
    </StatusTimeline>,
  );

  expect(screen.getByRole("list").tagName).toBe("OL");
  expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
    "Pago pendiente",
    "Pagado",
    "Enviado",
  ]);
});
