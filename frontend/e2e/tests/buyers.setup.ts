import { mkdirSync, writeFileSync } from "node:fs";

import { test as setup } from "@playwright/test";

import { loginUser, registerUser } from "../support/api";
import { AUTH_DIR, BUYER_COUNT, BUYERS_FILE, buyerStatePath, type Buyer } from "../support/buyers";
import { BASE_URL } from "../support/stack";
import { newUser } from "../support/users";

setup("register the buyers and open their sessions", async ({ playwright }) => {
  mkdirSync(AUTH_DIR, { recursive: true });
  const buyers: Buyer[] = [];
  for (let index = 0; index < BUYER_COUNT; index++) {
    const user = newUser("buyer-");
    const request = await playwright.request.newContext({ baseURL: BASE_URL });
    await registerUser(request, user);
    await loginUser(request, user);
    const storageState = buyerStatePath(index);
    await request.storageState({ path: storageState });
    await request.dispose();
    buyers.push({ email: user.email, password: user.password, storageState });
  }
  writeFileSync(BUYERS_FILE, JSON.stringify(buyers));
});
