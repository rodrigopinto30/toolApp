"use client";

import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { useSession } from "@/features/session/session-provider";
import type { Locale } from "@/i18n/locales";
import { api } from "@/lib/api/browser";
import { unwrap } from "@/lib/api/errors";

import { nextPage, REVIEWS_PAGE_SIZE } from "./pagination";
import type { ReviewValues } from "./schemas";
import type { ProductReviewPage } from "./types";

export const reviewKeys = {
  product: (slug: string) => ["products", slug, "reviews"] as const,
  account: ["me", "reviews"] as const,
  reviewable: (locale: Locale) => ["me", "reviews", "reviewable", locale] as const,
  own: (locale: Locale) => ["me", "reviews", "own", locale] as const,
};

export function useProductReviews(slug: string, initial: ProductReviewPage) {
  return useInfiniteQuery({
    queryKey: reviewKeys.product(slug),
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET("/api/v1/products/{slug}/reviews", {
          params: { path: { slug }, query: { page: pageParam, size: REVIEWS_PAGE_SIZE } },
        }),
      ),
    initialPageParam: 1,
    initialData: { pages: [initial], pageParams: [1] },
    getNextPageParam: nextPage,
    enabled: false,
    gcTime: 0,
  });
}

export function useReviewableProducts() {
  const { hasSession } = useSession();
  const locale = useLocale() as Locale;
  return useInfiniteQuery({
    queryKey: reviewKeys.reviewable(locale),
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET("/api/v1/me/reviewable", {
          params: { query: { page: pageParam, size: REVIEWS_PAGE_SIZE, locale } },
        }),
      ),
    initialPageParam: 1,
    getNextPageParam: nextPage,
    enabled: hasSession,
  });
}

export function useOwnReviews() {
  const { hasSession } = useSession();
  const locale = useLocale() as Locale;
  return useInfiniteQuery({
    queryKey: reviewKeys.own(locale),
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET("/api/v1/me/reviews", {
          params: { query: { page: pageParam, size: REVIEWS_PAGE_SIZE, locale } },
        }),
      ),
    initialPageParam: 1,
    getNextPageParam: nextPage,
    enabled: hasSession,
  });
}

export function useCreateReview(slug: string) {
  const queryClient = useQueryClient();
  const locale = useLocale() as Locale;
  return useMutation({
    mutationFn: (body: ReviewValues) =>
      unwrap(
        api.POST("/api/v1/products/{slug}/reviews", {
          params: { path: { slug }, query: { locale } },
          body,
        }),
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: reviewKeys.account }),
  });
}
