import { mkdirSync, writeFileSync } from "node:fs";

import { test as setup, type PlaywrightWorkerArgs } from "@playwright/test";

import { loginUser, registerUser } from "../support/api";
import { AUTH_DIR, BUYER_NAMES, BUYERS_FILE, statePath, type Buyer, type BuyerName, type Shoppers } from "../support/buyers";
import { BASE_URL } from "../support/stack";
import { newUser } from "../support/users";

async function openSession(playwright: PlaywrightWorkerArgs["playwright"], prefix: string, name: string): Promise<Buyer> {
  const user = newUser(prefix);
  const request = await playwright.request.newContext({ baseURL: BASE_URL });
  await registerUser(request, user);
  await loginUser(request, user);
  const storageState = statePath(name);
  await request.storageState({ path: storageState });
  await request.dispose();
  return { email: user.email, password: user.password, storageState };
}

setup("register the shoppers and open their sessions", async ({ playwright }) => {
  mkdirSync(AUTH_DIR, { recursive: true });
  const buyers = {} as Record<BuyerName, Buyer>;
  for (const name of BUYER_NAMES) {
    buyers[name] = await openSession(playwright, "buyer-", `buyer-${name}`);
  }
  const shoppers: Shoppers = { buyers, unverified: await openSession(playwright, "unverified-", "unverified") };
  writeFileSync(BUYERS_FILE, JSON.stringify(shoppers));
});
