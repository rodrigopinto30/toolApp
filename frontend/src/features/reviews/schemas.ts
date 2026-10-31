import { text } from "@/features/account/schemas";
import type { Translate } from "@/features/auth/schemas";
import { z } from "@/lib/zod";

export const RATINGS = [1, 2, 3, 4, 5] as const;
export const TITLE_MAX_LENGTH = 120;
export const BODY_MAX_LENGTH = 2000;

export const reviewSchema = (t: Translate) =>
  z.object({
    rating: z.number().int().min(1, t("rating")).max(5, t("rating")),
    title: text(t, TITLE_MAX_LENGTH),
    body: text(t, BODY_MAX_LENGTH),
  });

export type ReviewValues = z.input<ReturnType<typeof reviewSchema>>;
