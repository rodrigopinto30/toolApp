import { mkdirSync, writeFileSync } from "node:fs";

import { chromium } from "@playwright/test";
import lighthouse from "lighthouse";

const BASE_URL = "https://localhost:8443";
const REPORTS = "test-results/lighthouse";
const PORT = 9222;
const RUNS = 3;
const CATEGORIES = ["performance", "accessibility", "best-practices", "seo"];

async function api(path) {
  const response = await fetch(`${BASE_URL}/api/v1${path}`);
  if (!response.ok) {
    throw new Error(`${path} answered ${response.status}`);
  }
  return response.json();
}

function median(results) {
  const sorted = [...results].sort((a, b) => a.categories.performance.score - b.categories.performance.score);
  return sorted[Math.floor(sorted.length / 2)];
}

function row(name, result) {
  const score = (id) => String(Math.round(result.categories[id].score * 100)).padStart(4);
  const audit = (id) => result.audits[id].displayValue.padStart(8);
  const kilobytes = Math.round(result.audits["total-byte-weight"].numericValue / 1024);
  return [
    name.padEnd(8),
    ...CATEGORIES.map(score),
    audit("first-contentful-paint"),
    audit("largest-contentful-paint"),
    audit("total-blocking-time"),
    audit("cumulative-layout-shift"),
    `${kilobytes} KB`.padStart(8),
  ].join(" ");
}

const [category] = await api("/categories?locale=es");
const { items } = await api("/products?locale=es&currency=ARS&size=1");
const pages = {
  home: "/es",
  listing: `/es/categories/${category.slug}`,
  product: `/es/products/${items[0].slug}`,
};

mkdirSync(REPORTS, { recursive: true });
const browser = await chromium.launch({
  channel: "chromium",
  args: [`--remote-debugging-port=${PORT}`, "--ignore-certificate-errors"],
});

console.log("page     perf a11y best  seo      FCP      LCP      TBT      CLS   weight");
try {
  for (const [name, path] of Object.entries(pages)) {
    const results = [];
    for (let run = 0; run < RUNS; run += 1) {
      const { lhr } = await lighthouse(`${BASE_URL}${path}`, {
        port: PORT,
        logLevel: "error",
        output: "json",
        onlyCategories: CATEGORIES,
      });
      results.push(lhr);
    }
    const result = median(results);
    writeFileSync(`${REPORTS}/${name}.json`, JSON.stringify(result));
    console.log(row(name, result));
  }
} finally {
  await browser.close();
}
