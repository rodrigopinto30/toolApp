import { mkdirSync } from "node:fs";

import type { PlaywrightWorkerArgs } from "@playwright/test";

import { loginUser, registerUser } from "./api";
import { AUTH_DIR, saveShopper, statePath, type ShopperName } from "./buyers";
import { BASE_URL } from "./stack";
import { newUser } from "./users";

export async function openSession(
  playwright: PlaywrightWorkerArgs["playwright"],
  name: ShopperName,
  prefix: string,
): Promise<void> {
  mkdirSync(AUTH_DIR, { recursive: true });
  const user = newUser(prefix);
  const request = await playwright.request.newContext({ baseURL: BASE_URL });
  await registerUser(request, user);
  await loginUser(request, user);
  const storageState = statePath(name);
  await request.storageState({ path: storageState });
  await request.dispose();
  saveShopper(name, { email: user.email, password: user.password, storageState });
}
