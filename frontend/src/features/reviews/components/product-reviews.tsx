"use client";

import { useTranslations } from "next-intl";

import { ReviewItem } from "@/features/reviews/components/review-item";
import { ShowMore } from "@/features/reviews/components/show-more";
import { useProductReviews } from "@/features/reviews/hooks";
import type { ProductReviewPage } from "@/features/reviews/types";

export function ProductReviews({ slug, initial }: { slug: string; initial: ProductReviewPage }) {
  const t = useTranslations("Reviews");
  const reviews = useProductReviews(slug, initial);
  const items = [...new Map(reviews.data.pages.flatMap((page) => page.items).map((item) => [item.id, item])).values()];

  return (
    <section aria-labelledby="product-reviews" className="grid gap-3">
      <h2 id="product-reviews" className="text-lg font-semibold">
        {t("title")}
      </h2>
      {items.length === 0 ? (
        <p className="text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="grid max-w-3xl gap-3">
          {items.map((review) => (
            <ReviewItem key={review.id} review={review} />
          ))}
        </ul>
      )}
      <ShowMore query={reviews} label={t("showMore")} />
    </section>
  );
}
