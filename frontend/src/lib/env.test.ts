import { parseServerEnv } from "./env";

describe("parseServerEnv", () => {
  it("accepts the internal API URL and drops trailing slashes", () => {
    expect(parseServerEnv({ INTERNAL_API_URL: "http://backend:8000/api/" })).toEqual({
      INTERNAL_API_URL: "http://backend:8000/api",
    });
  });

  it.each([{}, { INTERNAL_API_URL: "" }, { INTERNAL_API_URL: "backend:8000" }])(
    "rejects a missing or invalid URL (%o)",
    (source) => {
      expect(() => parseServerEnv(source)).toThrow("INTERNAL_API_URL");
    },
  );
});
