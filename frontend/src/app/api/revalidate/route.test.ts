import { revalidateTag } from "next/cache";

import { POST } from "./route";

jest.mock("next/cache", () => ({ revalidateTag: jest.fn() }));

const SECRET = "a-shared-secret";

function revalidate(body: unknown, authorization: string | null = `Bearer ${SECRET}`) {
  return POST(
    new Request("http://frontend:3000/api/revalidate", {
      method: "POST",
      headers: authorization ? { authorization } : {},
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

describe("POST /api/revalidate", () => {
  beforeAll(() => {
    Object.assign(process.env, {
      INTERNAL_API_ORIGIN: "http://backend:8000",
      PUBLIC_URL: "https://localhost:8443",
      REVALIDATE_SECRET: SECRET,
    });
  });

  beforeEach(() => jest.mocked(revalidateTag).mockClear());

  it("expires each tag at once, once", async () => {
    const response = await revalidate({ tags: ["catalog", "pricing", "catalog"] });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ revalidated: ["catalog", "pricing"] });
    expect(jest.mocked(revalidateTag).mock.calls).toEqual([
      ["catalog", { expire: 0 }],
      ["pricing", { expire: 0 }],
    ]);
  });

  it.each([null, "Bearer wrong", SECRET, `Basic ${SECRET}`])("rejects the header %s", async (authorization) => {
    const response = await revalidate({ tags: ["catalog"] }, authorization);

    expect(response.status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it.each([{ tags: ["orders"] }, { tags: [] }, { tags: "catalog" }, {}, "not json"])(
    "rejects the body %j",
    async (body) => {
      const response = await revalidate(body);

      expect(response.status).toBe(422);
      expect(revalidateTag).not.toHaveBeenCalled();
    },
  );
});
