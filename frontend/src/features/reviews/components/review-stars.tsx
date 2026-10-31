import { cn } from "cn";
import { StarIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { RATINGS } from "@/features/reviews/schemas";

export function ReviewStars({ rating }: { rating: number }) {
  const t = useTranslations("Reviews");

  return (
    <p className="flex items-center gap-0.5">
      <span className="sr-only">{t("rated", { rating })}</span>
      {RATINGS.map((star) => (
        <StarIcon
          key={star}
          aria-hidden="true"
          className={cn("size-4", star <= rating ? "fill-current" : "text-muted-foreground/40")}
        />
      ))}
    </p>
  );
}
