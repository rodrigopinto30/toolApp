import type { MetadataRoute } from "next";
import { connection } from "next/server";

import { getAllProductSlugs, getCategoryTree } from "@/features/catalog/api";
import { catalogPaths, sitemapEntries } from "@/features/catalog/sitemap";
import { DEFAULT_LOCALE } from "@/i18n/locales";
import { serverEnv } from "@/lib/env";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const [tree, productSlugs] = await Promise.all([
    getCategoryTree(DEFAULT_LOCALE),
    getAllProductSlugs(DEFAULT_LOCALE),
  ]);
  return sitemapEntries(serverEnv().PUBLIC_URL, catalogPaths(tree, productSlugs));
}
