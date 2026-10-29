import { request } from "@playwright/test";

import { PROTECTED_PATHS } from "../../src/lib/routes";
import { ACCESS_COOKIE } from "../../src/lib/session-cookies";
import { BASE_URL, isDevStack } from "./stack";

const PUBLIC_PATHS = ["", "/login", "/register", "/verify-email", "/forgot-password", "/reset-password"];
const ATTEMPTS = 5;

export default async function warmUpDevServer(): Promise<void> {
  if (!isDevStack) {
    return;
  }
  const context = await request.newContext({ baseURL: BASE_URL, timeout: 120_000 });
  const pages = [
    ...PUBLIC_PATHS.map((path) => ({ path, headers: {} })),
    ...PROTECTED_PATHS.map((path) => ({ path, headers: { Cookie: `${ACCESS_COOKIE}=warm-up` } })),
  ];
  for (const { path, headers } of pages) {
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      const response = await context.get(`/es${path}`, { headers, maxRedirects: 0 });
      if (response.status() < 500) {
        break;
      }
    }
  }
  await context.dispose();
}
