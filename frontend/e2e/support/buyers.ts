import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { Credentials } from "./users";

export const AUTH_DIR = path.resolve(__dirname, "../.auth");

export type BuyerName = "books" | "cart" | "checkout" | "community" | "orders";
export type ShopperName = BuyerName | "unverified" | "admin";
export type Buyer = Credentials & { storageState: string };

export function statePath(name: ShopperName): string {
  return path.join(AUTH_DIR, `${name}.json`);
}

function accountPath(name: ShopperName): string {
  return path.join(AUTH_DIR, `${name}.account.json`);
}

export function saveShopper(name: ShopperName, shopper: Buyer): void {
  writeFileSync(accountPath(name), JSON.stringify(shopper));
}

export function readShopper(name: ShopperName): Buyer {
  return JSON.parse(readFileSync(accountPath(name), "utf8")) as Buyer;
}
