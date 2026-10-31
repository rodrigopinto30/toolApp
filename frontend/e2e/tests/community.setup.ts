import { test as setup } from "@playwright/test";

import { openSession } from "../support/sessions";

setup("register the reviewer and the admin", async ({ playwright }) => {
  await openSession(playwright, "community", "buyer-");
  await openSession(playwright, "admin", "admin-");
});
