"use client";

import { cn } from "cn";
import { HeartIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { useFavoriteSlugs, useSetFavorite } from "@/features/favorites/hooks";
import { useSession } from "@/features/session/session-provider";
import { useHydrated } from "@/lib/use-hydrated";

export function FavoriteButton({ slug, name, className }: { slug: string; name: string; className?: string }) {
  const t = useTranslations("Favorites");
  const locale = useLocale();
  const router = useRouter();
  const hydrated = useHydrated();
  const { hasSession } = useSession();
  const slugs = useFavoriteSlugs();
  const setFavorite = useSetFavorite(slug);
  const favorite = slugs.data?.has(slug) ?? false;

  const onClick = () => {
    if (hasSession) {
      setFavorite.mutate(!favorite);
      return;
    }
    const next = `${window.location.pathname}${window.location.search}`;
    router.push(`/${locale}/login?next=${encodeURIComponent(next)}`);
  };

  return (
    <Button
      type="button"
      variant="secondary"
      size="icon"
      aria-label={t("toggle", { name })}
      aria-pressed={favorite}
      disabled={!hydrated || (hasSession && !slugs.data)}
      className={cn("rounded-full shadow-sm", className)}
      onClick={onClick}
    >
      <HeartIcon aria-hidden="true" className={cn(favorite && "fill-current text-destructive")} />
    </Button>
  );
}
