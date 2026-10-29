import { z } from "./zod";

it("validates without eval, which the production CSP blocks", () => {
  const evaluate = jest.spyOn(globalThis, "Function");

  expect(z.object({ name: z.string() }).parse({ name: "Ana" })).toEqual({ name: "Ana" });
  expect(evaluate).not.toHaveBeenCalled();

  evaluate.mockRestore();
});
