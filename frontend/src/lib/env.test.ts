import { parseServerEnv } from "./env";

describe("parseServerEnv", () => {
  const VALID = { INTERNAL_API_ORIGIN: "http://backend:8000", PUBLIC_URL: "https://localhost:8443" };

  it("accepts the internal API origin and the public URL", () => {
    expect(parseServerEnv({ INTERNAL_API_ORIGIN: "http://backend:8000/", PUBLIC_URL: "https://shop.example/" })).toEqual({
      INTERNAL_API_ORIGIN: "http://backend:8000",
      PUBLIC_URL: "https://shop.example",
    });
  });

  it("reads the revalidation secret, and treats an empty one as missing", () => {
    expect(parseServerEnv({ ...VALID, REVALIDATE_SECRET: "secret" }).REVALIDATE_SECRET).toBe("secret");
    expect(parseServerEnv({ ...VALID, REVALIDATE_SECRET: "" }).REVALIDATE_SECRET).toBeUndefined();
    expect(parseServerEnv(VALID).REVALIDATE_SECRET).toBeUndefined();
  });

  it.each([
    { PUBLIC_URL: VALID.PUBLIC_URL },
    { ...VALID, INTERNAL_API_ORIGIN: "" },
    { ...VALID, INTERNAL_API_ORIGIN: "backend:8000" },
    { ...VALID, INTERNAL_API_ORIGIN: "http://backend:8000/api" },
    { ...VALID, INTERNAL_API_ORIGIN: "http://backend:8000/?x=1" },
  ])("rejects a missing or invalid internal origin (%o)", (source) => {
    expect(() => parseServerEnv(source)).toThrow("INTERNAL_API_ORIGIN");
  });

  it.each([
    { INTERNAL_API_ORIGIN: VALID.INTERNAL_API_ORIGIN },
    { ...VALID, PUBLIC_URL: "http://localhost:8443" },
    { ...VALID, PUBLIC_URL: "https://localhost:8443/es" },
  ])("rejects a missing, insecure or non-origin public URL (%o)", (source) => {
    expect(() => parseServerEnv(source)).toThrow("PUBLIC_URL");
  });
});
