import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export function isBearer(header: string | null, secret: string | undefined): boolean {
  if (!header || !secret) {
    return false;
  }
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}
