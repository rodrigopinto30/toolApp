import { expect, type APIRequestContext } from "@playwright/test";

import { CSRF_COOKIE, CSRF_HEADER } from "../../src/lib/api/cookies";
import type { Locale } from "./i18n";
import type { TestUser } from "./users";

export async function registerUser(request: APIRequestContext, user: TestUser, locale: Locale = "es") {
  await request.get("/api/v1/auth/csrf");
  const { cookies } = await request.storageState();
  const response = await request.post("/api/v1/auth/register", {
    headers: { [CSRF_HEADER]: cookies.find((cookie) => cookie.name === CSRF_COOKIE)?.value ?? "" },
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
