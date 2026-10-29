import "@testing-library/jest-dom";

import { server } from "@/test/msw/server";

Object.assign(Element.prototype, {
  hasPointerCapture: () => false,
  releasePointerCapture: () => undefined,
  scrollIntoView: () => undefined,
});

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
