"use client";

import { useReportWebVitals } from "next/web-vitals";

type Metric = Parameters<Parameters<typeof useReportWebVitals>[0]>[0];

const ENDPOINT = "/api/v1/web-vitals";
const REPORTED = new Set(["LCP", "INP", "CLS"]);

function report({ name, value, rating }: Metric): void {
  if (REPORTED.has(name)) {
    navigator.sendBeacon(ENDPOINT, JSON.stringify({ name, value, rating, path: location.pathname }));
  }
}

export function WebVitals() {
  useReportWebVitals(report);
  return null;
}
