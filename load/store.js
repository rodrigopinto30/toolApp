import { check } from "k6";
import http from "k6/http";

const BASE_URL = "https://localhost:8443";
const SCENARIO = __ENV.SCENARIO || "pages";
const RATE = Number(__ENV.RATE || 10);
const RAMP = __ENV.RAMP || "15s";
const HOLD = __ENV.HOLD || "45s";
const DOWN = __ENV.DOWN || "5s";
const FIRST_VISIT_SHARE = Number(__ENV.FIRST_VISIT_SHARE ?? 0.2);
const MAX_VUS = 600;
const SEARCHES = ["taladro", "martillo", "tarugos", "sierra", "destornillador"];
const STATIC_ASSET = /\/_next\/static\/[^"\\]+\.(?:js|css)/g;
const JSON_PARAMS = { responseType: "text", headers: { "Accept-Encoding": "gzip" } };

export const options = {
  insecureSkipTLSVerify: true,
  discardResponseBodies: true,
  summaryTrendStats: ["med", "p(95)", "p(99)", "max"],
  scenarios: {
    [SCENARIO]: {
      executor: "ramping-arrival-rate",
      exec: SCENARIO,
      startRate: 0,
      timeUnit: "1s",
      preAllocatedVUs: Math.min(RATE * 2, MAX_VUS),
      maxVUs: MAX_VUS,
      stages: [
        { target: RATE, duration: RAMP },
        { target: RATE, duration: HOLD },
        { target: 0, duration: DOWN },
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_req_duration{kind:page}": ["p(95)<1000"],
    "http_req_duration{kind:api}": ["p(95)<300"],
    "http_req_duration{kind:static}": ["p(95)<500"],
    dropped_iterations: ["count<1"],
  },
};

function get(path, kind) {
  const response = http.get(`${BASE_URL}${path}`, {
    headers: { "Accept-Encoding": "gzip" },
    tags: { kind, name: kind },
    timeout: "15s",
  });
  check(response, { "answers 200": (res) => res.status === 200 });
}

function pick(items) {
  return items[Math.floor(Math.random() * items.length)];
}

export function setup() {
  const categories = http.get(`${BASE_URL}/api/v1/categories?locale=es`, JSON_PARAMS).json();
  const products = http.get(`${BASE_URL}/api/v1/products?locale=es&currency=ARS&size=48`, JSON_PARAMS).json();
  const home = http.get(`${BASE_URL}/es`, { responseType: "text" }).body;
  return {
    categories: categories.map((category) => category.slug),
    products: products.items.map((product) => product.slug),
    assets: [...new Set(home.match(STATIC_ASSET))],
  };
}

export function pages({ categories, products, assets }) {
  const paths = [
    "/es",
    `/es/categories/${pick(categories)}`,
    `/es/search?q=${pick(SEARCHES)}`,
    `/es/products/${pick(products)}`,
    `/es/products/${pick(products)}`,
  ];
  get(pick(paths), "page");
  if (Math.random() < FIRST_VISIT_SHARE) {
    for (const asset of assets) {
      get(asset, "static");
    }
  }
}

export function api({ categories, products }) {
  const paths = [
    "/api/v1/categories?locale=es",
    "/api/v1/products/featured?locale=es&currency=ARS",
    `/api/v1/products?locale=es&currency=ARS&category=${pick(categories)}`,
    `/api/v1/products?locale=es&currency=ARS&q=${pick(SEARCHES)}`,
    `/api/v1/products/facets?locale=es&currency=ARS&category=${pick(categories)}`,
    `/api/v1/products/${pick(products)}?locale=es&currency=ARS`,
  ];
  get(pick(paths), "api");
}

export function handleSummary({ metrics }) {
  const trend = metrics[`http_req_duration{kind:${SCENARIO === "pages" ? "page" : "api"}}`].values;
  const dropped = metrics.dropped_iterations?.values.count ?? 0;
  const iterations = metrics.iterations?.values.count ?? 0;
  const failed = metrics.http_req_failed.values.rate * 100;
  const fields = [
    trend.med,
    trend["p(95)"],
    trend["p(99)"],
    failed,
    (dropped / Math.max(dropped + iterations, 1)) * 100,
  ];
  return { stdout: `RESULT ${fields.map((value) => value.toFixed(1)).join(" ")}\n` };
}
