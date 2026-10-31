import { test as setup } from "@playwright/test";

import type { BuyerName } from "../support/buyers";
import { openSession } from "../support/sessions";

const BUYERS: BuyerName[] = ["books", "cart", "checkout", "orders"];

setup("register the shoppers and open their sessions", async ({ playwright }) => {
  for (const name of BUYERS) {
    await openSession(playwright, name, "buyer-");
  }
  await openSession(playwright, "unverified", "unverified-");
});
