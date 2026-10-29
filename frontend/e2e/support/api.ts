import { expect, type APIRequestContext } from "@playwright/test";

import { CSRF_COOKIE, CSRF_HEADER } from "../../src/lib/api/cookies";
import type { Locale } from "./i18n";
import type { Credentials, TestUser } from "./users";

export async function csrfHeaders(request: APIRequestContext): Promise<Record<string, string>> {
  let { cookies } = await request.storageState();
  if (!cookies.some((cookie) => cookie.name === CSRF_COOKIE)) {
    await request.get("/api/v1/auth/csrf");
    ({ cookies } = await request.storageState());
  }
  return { [CSRF_HEADER]: cookies.find((cookie) => cookie.name === CSRF_COOKIE)?.value ?? "" };
}

export async function loginUser(request: APIRequestContext, { email, password }: Credentials) {
  const response = await request.post("/api/v1/auth/login", {
    headers: await csrfHeaders(request),
    data: { email, password },
  });
  expect(response.status(), await response.text()).toBe(200);
}

export async function registerUser(request: APIRequestContext, user: TestUser, locale: Locale = "es") {
  const response = await request.post("/api/v1/auth/register", {
    headers: await csrfHeaders(request),
    data: {
      email: user.email,
      password: user.password,
      first_name: user.firstName,
      last_name: user.lastName,
      locale,
    },
  });
  expect(response.status(), await response.text()).toBe(202);
}
