import "server-only";

import { unwrap } from "@/lib/api/errors";
import { publicCache, serverApi } from "@/lib/api/server";

import { REVIEWS_PAGE_SIZE } from "./pagination";

const CATALOG = publicCache(["catalog"]);

export function getProductReviews(slug: string) {
  return unwrap(
    serverApi().GET("/api/v1/products/{slug}/reviews", {
      params: { path: { slug }, query: { page: 1, size: REVIEWS_PAGE_SIZE } },
      ...CATALOG,
    }),
  );
}
