"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import { FormAlert } from "@/components/form/form-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductImage } from "@/features/catalog/components/product-image";
import { productPath } from "@/features/catalog/paths";
import { useErrorMessage } from "@/features/errors/use-error-message";
import { ReviewForm } from "@/features/reviews/components/review-form";
import { ReviewStars } from "@/features/reviews/components/review-stars";
import { ShowMore } from "@/features/reviews/components/show-more";
import { useOwnReviews, useReviewableProducts } from "@/features/reviews/hooks";
import type { OwnReview, ReviewProduct, ReviewStatus } from "@/features/reviews/types";
import { useProtectedMe } from "@/features/session/use-protected-me";
import { Link } from "@/i18n/navigation";

const THUMBNAIL_SIZES = "3rem";
const STATUS_VARIANTS = {
  pending: "secondary",
  approved: "outline",
  rejected: "destructive",
} as const satisfies Record<ReviewStatus, string>;

export function ReviewsView() {
  const t = useTranslations("AccountReviews");
  const errorMessage = useErrorMessage();
  useProtectedMe();
  const reviewable = useReviewableProducts();
  const own = useOwnReviews();
  const [product, setProduct] = useState<ReviewProduct | null>(null);
  const close = () => setProduct(null);
  const products = reviewable.data?.pages.flatMap((page) => page.items);
  const reviews = own.data?.pages.flatMap((page) => page.items);
  const failure = reviewable.isError ? reviewable.error : own.isError ? own.error : null;

  if (failure) {
    return <FormAlert message={errorMessage(failure)} />;
  }
  if (!products || !reviews) {
    return (
      <div aria-busy="true" aria-label={t("loading")} className="grid gap-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }
  return (
    <div className="grid gap-8">
      <section aria-labelledby="reviewable-products" className="grid gap-3">
        <h2 id="reviewable-products" className="text-lg font-semibold">
          {t("reviewable.title")}
        </h2>
        {products.length === 0 ? (
          <p className="text-muted-foreground">{t("reviewable.empty")}</p>
        ) : (
          <ul className="grid gap-2">
            {products.map((item) => (
              <ReviewableRow key={item.slug} product={item} onWrite={() => setProduct(item)} />
            ))}
          </ul>
        )}
        <ShowMore query={reviewable} label={t("showMore")} />
      </section>
      <section aria-labelledby="own-reviews" className="grid gap-3">
        <h2 id="own-reviews" className="text-lg font-semibold">
          {t("own.title")}
        </h2>
        {reviews.length === 0 ? (
          <p className="text-muted-foreground">{t("own.empty")}</p>
        ) : (
          <ul className="grid gap-2">
            {reviews.map((review) => (
              <OwnReviewRow key={review.id} review={review} />
            ))}
          </ul>
        )}
        <ShowMore query={own} label={t("showMore")} />
      </section>
      <Sheet open={product !== null} onOpenChange={(open) => !open && close()}>
        <SheetContent closeLabel={t("close")} className="gap-0 overflow-y-auto data-[side=right]:sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{product && t("form.title", { name: product.name })}</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-4">
            {product && <ReviewForm key={product.slug} slug={product.slug} onSaved={close} onCancel={close} />}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ReviewableRow({ product, onWrite }: { product: ReviewProduct; onWrite: () => void }) {
  const t = useTranslations("AccountReviews");

  return (
    <li className="flex items-center gap-3 rounded-lg border p-3">
      <ProductImage image={product.image} sizes={THUMBNAIL_SIZES} className="size-12 shrink-0" />
      <Link href={productPath(product.slug)} className="min-w-0 flex-1 font-medium wrap-anywhere hover:underline">
        {product.name}
      </Link>
      <Button
        variant="outline"
        size="sm"
        aria-label={t("reviewable.writeItem", { name: product.name })}
        onClick={onWrite}
      >
        {t("reviewable.write")}
      </Button>
    </li>
  );
}

function OwnReviewRow({ review }: { review: OwnReview }) {
  const t = useTranslations("AccountReviews");
  const format = useFormatter();
  const date = format.dateTime(new Date(review.created_at), { dateStyle: "medium" });

  return (
    <li className="grid gap-1 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={productPath(review.product.slug)} className="font-medium wrap-anywhere hover:underline">
          {review.product.name}
        </Link>
        <Badge variant={STATUS_VARIANTS[review.status]}>{t(`status.${review.status}`)}</Badge>
      </div>
      <ReviewStars rating={review.rating} />
      <p className="font-medium wrap-anywhere">{review.title}</p>
      <p className="whitespace-pre-line wrap-anywhere text-muted-foreground">{review.body}</p>
      <p className="text-xs text-muted-foreground">{date}</p>
    </li>
  );
}
