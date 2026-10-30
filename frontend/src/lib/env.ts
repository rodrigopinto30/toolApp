import "server-only";

import { z } from "@/lib/zod";

function origin(protocol: RegExp) {
  return z
    .url({ protocol })
    .refine((value) => URL.canParse(value) && new URL(value).pathname === "/" && !new URL(value).search, {
      message: "Must be an origin, without path or query",
    })
    .transform((value) => new URL(value).origin);
}

const serverEnvSchema = z.object({
  INTERNAL_API_ORIGIN: origin(/^https?$/),
  PUBLIC_URL: origin(/^https$/),
  REVALIDATE_SECRET: z
    .string()
    .optional()
    .transform((value) => value || undefined),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid server environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}
