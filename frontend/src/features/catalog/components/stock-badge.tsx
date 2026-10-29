import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import type { StockStatus } from "@/features/catalog/types";

const VARIANTS = {
  in_stock: "secondary",
  low_stock: "outline",
  out_of_stock: "destructive",
} as const satisfies Record<StockStatus, string>;

export function StockBadge({ status }: { status: StockStatus }) {
  const t = useTranslations("Catalog.stock");

  return <Badge variant={VARIANTS[status]}>{t(status)}</Badge>;
}
