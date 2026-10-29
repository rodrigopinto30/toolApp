import { readFileSync } from "node:fs";
import path from "node:path";

import type { Credentials } from "./users";

export const AUTH_DIR = path.resolve(__dirname, "../.auth");
export const BUYERS_FILE = path.join(AUTH_DIR, "buyers.json");
export const BUYER_COUNT = 2;

export type Buyer = Credentials & { storageState: string };

export function buyerStatePath(index: number): string {
  return path.join(AUTH_DIR, `buyer-${index}.json`);
}

export function readBuyers(): Buyer[] {
  return JSON.parse(readFileSync(BUYERS_FILE, "utf8")) as Buyer[];
}
