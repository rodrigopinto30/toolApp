import { revalidateTag } from "next/cache";

import { isBearer } from "@/lib/bearer";
import { serverEnv } from "@/lib/env";
import { z } from "@/lib/zod";

const REVALIDATION_TAGS = ["catalog", "pricing", "shipping"] as const;

const bodySchema = z.object({ tags: z.array(z.enum(REVALIDATION_TAGS)).min(1) });

export async function POST(request: Request) {
  if (!isBearer(request.headers.get("authorization"), serverEnv().REVALIDATE_SECRET)) {
    return Response.json({ code: "unauthorized" }, { status: 401 });
  }
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return Response.json({ code: "validation_error" }, { status: 422 });
  }
  const tags = [...new Set(body.data.tags)];
  for (const tag of tags) {
    revalidateTag(tag, { expire: 0 });
  }
  return Response.json({ revalidated: tags });
}
