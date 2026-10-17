import { parseServerEnv } from "./env";

describe("parseServerEnv", () => {
  it("accepts the internal API origin", () => {
    expect(parseServerEnv({ INTERNAL_API_ORIGIN: "http://backend:8000/" })).toEqual({
      INTERNAL_API_ORIGIN: "http://backend:8000",
    });
  });

  it.each([
    {},
    { INTERNAL_API_ORIGIN: "" },
    { INTERNAL_API_ORIGIN: "backend:8000" },
    { INTERNAL_API_ORIGIN: "http://backend:8000/api" },
    { INTERNAL_API_ORIGIN: "http://backend:8000/?x=1" },
  ])("rejects a missing or invalid origin (%o)", (source) => {
    expect(() => parseServerEnv(source)).toThrow("INTERNAL_API_ORIGIN");
  });
});
