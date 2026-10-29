import type { MetadataRoute } from "next";
import { connection } from "next/server";

import { serverEnv } from "@/lib/env";

export default async function robots(): Promise<MetadataRoute.Robots> {
  await connection();
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: `${serverEnv().PUBLIC_URL}/sitemap.xml`,
  };
}
