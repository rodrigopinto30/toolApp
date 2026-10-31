"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { useSession } from "@/features/session/session-provider";
import type { Locale } from "@/i18n/locales";
import { api } from "@/lib/api/browser";
import { unwrap } from "@/lib/api/errors";
import type { Currency } from "@/lib/currency";
import { useCurrency } from "@/lib/currency-context";

const PAGE_SIZE = 24;

export const favoriteKeys = {
  all: ["me", "favorites"] as const,
  slugs: ["me", "favorites", "slugs"] as const,
  list: (page: number, currency: Currency, locale: Locale) =>
    ["me", "favorites", "list", page, currency, locale] as const,
};

function toSet(slugs: string[]): Set<string> {
  return new Set(slugs);
}

function withFavorite(slugs: string[], slug: string, favorite: boolean): string[] {
  const others = slugs.filter((item) => item !== slug);
  return favorite ? [...others, slug] : others;
}

export function useFavoriteSlugs() {
  const { hasSession } = useSession();
  return useQuery({
    queryKey: favoriteKeys.slugs,
    queryFn: () => unwrap(api.GET("/api/v1/me/favorites/slugs")),
    enabled: hasSession,
    select: toSet,
  });
}

export function useFavorites(page: number) {
  const { hasSession } = useSession();
  const currency = useCurrency();
  const locale = useLocale() as Locale;
  return useQuery({
    queryKey: favoriteKeys.list(page, currency, locale),
    queryFn: () =>
      unwrap(api.GET("/api/v1/me/favorites", { params: { query: { page, size: PAGE_SIZE, currency, locale } } })),
    enabled: hasSession,
  });
}

export function useSetFavorite(slug: string) {
  const queryClient = useQueryClient();
  const params = { path: { slug } };
  const write = (favorite: boolean) =>
    queryClient.setQueryData<string[]>(favoriteKeys.slugs, (slugs) => slugs && withFavorite(slugs, slug, favorite));

  return useMutation({
    mutationKey: favoriteKeys.all,
    scope: { id: `favorite-${slug}` },
    mutationFn: (favorite: boolean) =>
      favorite
        ? unwrap(api.PUT("/api/v1/me/favorites/{slug}", { params }))
        : unwrap(api.DELETE("/api/v1/me/favorites/{slug}", { params })),
    onMutate: async (favorite) => {
      await queryClient.cancelQueries({ queryKey: favoriteKeys.slugs });
      const previous = queryClient.getQueryData<string[]>(favoriteKeys.slugs)?.includes(slug) ?? false;
      write(favorite);
      return { previous };
    },
    onError: (_error, _favorite, context) => {
      if (context) {
        write(context.previous);
      }
    },
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey: favoriteKeys.all }) === 1) {
        return queryClient.invalidateQueries({ queryKey: favoriteKeys.all });
      }
      return undefined;
    },
  });
}
