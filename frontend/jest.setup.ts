import "@testing-library/jest-dom";

import { server } from "@/test/msw/server";

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
