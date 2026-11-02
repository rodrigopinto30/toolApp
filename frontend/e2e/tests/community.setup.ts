import { test as setup } from "@playwright/test";

import { openSession } from "../support/sessions";

setup("register the reviewer, the other buyers and the admin", async ({ playwright }) => {
  await openSession(playwright, "accessibility", "buyer-");
  await openSession(playwright, "community", "buyer-");
  await openSession(playwright, "operations", "buyer-");
  await openSession(playwright, "admin", "admin-");
});
