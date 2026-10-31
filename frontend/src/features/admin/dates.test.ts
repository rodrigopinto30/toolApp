import { endOfDay, fromLocalInput, startOfDay, toLocalInput } from "./dates";

it("round-trips a moment through the local input format", () => {
  const iso = "2026-10-29T15:30:00.000Z";

  expect(toLocalInput(iso)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  expect(fromLocalInput(toLocalInput(iso))).toBe(iso);
});

it("covers a whole local day", () => {
  const start = new Date(startOfDay("2026-10-29")).getTime();
  const end = new Date(endOfDay("2026-10-29")).getTime();

  expect(end - start).toBe(24 * 60 * 60 * 1000 - 1);
  expect(toLocalInput(startOfDay("2026-10-29"))).toBe("2026-10-29T00:00");
});
