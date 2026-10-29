import type { MetadataRoute } from "next";

import { DEFAULT_LOCALE, LOCALES } from "@/i18n/locales";

import { categoryPath, productPath } from "./paths";
import { localizedUrl } from "./seo";
import type { CategoryNode } from "./types";

function categoryPaths(nodes: CategoryNode[]): string[] {
  return nodes.flatMap((node) => [categoryPath(node.slug), ...categoryPaths(node.children ?? [])]);
}

export function catalogPaths(tree: CategoryNode[], productSlugs: string[]): string[] {
  return ["/", ...categoryPaths(tree), ...productSlugs.map(productPath)];
}

export function sitemapEntries(origin: string, paths: string[]): MetadataRoute.Sitemap {
  return paths.flatMap((path) => {
    const languages = {
      ...Object.fromEntries(LOCALES.map((locale) => [locale, localizedUrl(origin, locale, path)])),
      "x-default": localizedUrl(origin, DEFAULT_LOCALE, path),
    };
    return LOCALES.map((locale) => ({ url: localizedUrl(origin, locale, path), alternates: { languages } }));
  });
}
