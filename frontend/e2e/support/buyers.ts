import { readFileSync } from "node:fs";
import path from "node:path";

import type { Credentials } from "./users";

export const AUTH_DIR = path.resolve(__dirname, "../.auth");
export const BUYERS_FILE = path.join(AUTH_DIR, "buyers.json");
export const BUYER_COUNT = 2;

export type Buyer = Credentials & { storageState: string };
export type Shoppers = { buyers: Buyer[]; unverified: Buyer };

export function statePath(name: string): string {
  return path.join(AUTH_DIR, `${name}.json`);
}

export function readShoppers(): Shoppers {
  return JSON.parse(readFileSync(BUYERS_FILE, "utf8")) as Shoppers;
}
