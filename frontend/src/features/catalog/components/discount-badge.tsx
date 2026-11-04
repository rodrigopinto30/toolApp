import { cn } from "cn";
import { useFormatter, useTranslations } from "next-intl";

export function DiscountBadge({ percent, className }: { percent: number; className?: string }) {
  const t = useTranslations("Catalog");
  const format = useFormatter();

  return (
    <span
      className={cn(
        "inline-flex rounded-sm bg-sale px-1.5 py-1 font-heading text-sm leading-none font-bold text-sale-foreground",
        className,
      )}
    >
      <span aria-hidden="true">{format.number(-percent / 100, { style: "percent" })}</span>
      <span className="sr-only">{t("discount", { percent: format.number(percent / 100, { style: "percent" }) })}</span>
    </span>
  );
}
