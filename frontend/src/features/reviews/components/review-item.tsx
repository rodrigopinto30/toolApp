import { useFormatter, useTranslations } from "next-intl";

import { ReviewStars } from "@/features/reviews/components/review-stars";
import type { ProductReview } from "@/features/reviews/types";

export function ReviewItem({ review }: { review: ProductReview }) {
  const t = useTranslations("Reviews");
  const format = useFormatter();
  const date = format.dateTime(new Date(review.created_at), { dateStyle: "medium" });

  return (
    <li className="grid gap-1 rounded-lg border p-4">
      <ReviewStars rating={review.rating} />
      <h3 className="font-medium wrap-anywhere">{review.title}</h3>
      <p className="whitespace-pre-line wrap-anywhere text-muted-foreground">{review.body}</p>
      <p className="text-xs text-muted-foreground">{t("byline", { author: review.author, date })}</p>
    </li>
  );
}
