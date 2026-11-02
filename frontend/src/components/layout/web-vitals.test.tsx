import { render } from "@testing-library/react";
import { useReportWebVitals } from "next/web-vitals";

import { WebVitals } from "./web-vitals";

jest.mock("next/web-vitals", () => ({ useReportWebVitals: jest.fn() }));

const useReport = jest.mocked(useReportWebVitals);
const sendBeacon = jest.fn();

type Report = Parameters<typeof useReportWebVitals>[0];

function reporter(): Report {
  render(<WebVitals />);
  return useReport.mock.calls[0][0];
}

function metric(name: string): Parameters<Report>[0] {
  return { name, value: 1200, rating: "good", id: "v1", delta: 1200, entries: [], navigationType: "navigate" };
}

beforeEach(() => {
  useReport.mockClear();
  sendBeacon.mockClear();
  Object.defineProperty(navigator, "sendBeacon", { value: sendBeacon, configurable: true });
  window.history.pushState({}, "", "/es/products/taladro?color=rojo#top");
});

it.each(["LCP", "INP", "CLS"])("sends %s with only the metric and the path", (name) => {
  reporter()(metric(name));

  const [url, body] = sendBeacon.mock.calls[0];
  expect(url).toBe("/api/v1/web-vitals");
  expect(JSON.parse(body)).toEqual({ name, value: 1200, rating: "good", path: "/es/products/taladro" });
});

it.each(["TTFB", "FCP", "Next.js-hydration"])("ignores %s", (name) => {
  reporter()(metric(name));

  expect(sendBeacon).not.toHaveBeenCalled();
});

it("keeps the same reporter between renders, so no metric is sent twice", () => {
  const { rerender } = render(<WebVitals />);
  rerender(<WebVitals />);

  expect(useReport.mock.calls[0][0]).toBe(useReport.mock.calls[1][0]);
});
