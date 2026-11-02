import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const STATS_PATH = ".next/diagnostics/route-bundle-stats.json";
const BUDGETS_PATH = "bundle-budgets.json";
const GZIP_LEVEL = 5;
const MARGIN = 1.1;
const KILOBYTE = 1024;

const stats = JSON.parse(readFileSync(STATS_PATH, "utf8"));
const budgets = Object.entries(JSON.parse(readFileSync(BUDGETS_PATH, "utf8"))).map(([name, budget]) => ({
  name,
  limit: budget.maxGzipKilobytes,
  pattern: new RegExp(budget.pattern),
}));

const chunkSizes = new Map();

function gzipSize(path) {
  if (!chunkSizes.has(path)) {
    chunkSizes.set(path, gzipSync(readFileSync(path), { level: GZIP_LEVEL }).length);
  }
  return chunkSizes.get(path);
}

function routeKilobytes({ firstLoadChunkPaths }) {
  return firstLoadChunkPaths.reduce((total, path) => total + gzipSize(path), 0) / KILOBYTE;
}

const failures = [];
const unassigned = stats.filter(({ route }) => !budgets.some(({ pattern }) => pattern.test(route)));
for (const { route } of unassigned) {
  failures.push(`${route} belongs to no group in ${BUDGETS_PATH}`);
}

console.log("group      limit  largest  suggested  route");
for (const { name, limit, pattern } of budgets) {
  const routes = stats.filter(({ route }) => pattern.test(route));
  if (routes.length === 0) {
    failures.push(`${name} matches no route`);
    continue;
  }
  const sized = routes.map((route) => ({ route: route.route, kilobytes: routeKilobytes(route) }));
  const largest = sized.reduce((a, b) => (b.kilobytes > a.kilobytes ? b : a));
  const suggested = Math.ceil(largest.kilobytes * MARGIN);
  console.log(
    `${name.padEnd(9)} ${String(limit).padStart(6)} ${largest.kilobytes.toFixed(1).padStart(8)} ${String(suggested).padStart(10)}  ${largest.route}`,
  );
  if (largest.kilobytes > limit) {
    failures.push(`${name}: ${largest.route} loads ${largest.kilobytes.toFixed(1)} KB of gzipped JS, over ${limit} KB`);
  }
}

if (failures.length > 0) {
  console.error(`\nBudgets failed:\n${failures.map((failure) => `  ${failure}`).join("\n")}`);
  process.exit(1);
}
console.log("\nBudgets pass.");
