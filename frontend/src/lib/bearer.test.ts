import { isBearer } from "./bearer";

describe("isBearer", () => {
  it("accepts the exact token", () => {
    expect(isBearer("Bearer secret", "secret")).toBe(true);
  });

  it.each([
    ["Bearer other", "secret"],
    ["Bearer secret ", "secret"],
    ["secret", "secret"],
    ["", "secret"],
    [null, "secret"],
    ["Bearer ", ""],
    ["Bearer secret", undefined],
  ])("rejects %j with the secret %j", (header, secret) => {
    expect(isBearer(header, secret)).toBe(false);
  });
});
