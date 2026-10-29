import { StarIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

export function Rating({ average, count }: { average: string; count: number }) {
  const t = useTranslations("Catalog");
  const format = useFormatter();

  if (!count) {
    return null;
  }
  const value = format.number(Number(average), { maximumFractionDigits: 1 });

  return (
    <p className="flex items-center gap-1 text-xs text-muted-foreground">
      <StarIcon aria-hidden="true" className="size-3 fill-current" />
      <span aria-hidden="true">
        {value} ({count})
      </span>
      <span className="sr-only">{t("rating", { average: value, count })}</span>
    </p>
  );
}
