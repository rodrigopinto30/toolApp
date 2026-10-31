import { test as setup } from "@playwright/test";

import { openSession } from "../support/sessions";

setup("register the reviewer, the operations buyer and the admin", async ({ playwright }) => {
  await openSession(playwright, "community", "buyer-");
  await openSession(playwright, "operations", "buyer-");
  await openSession(playwright, "admin", "admin-");
});
