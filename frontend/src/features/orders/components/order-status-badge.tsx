import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import type { OrderStatus } from "@/features/orders/types";

const VARIANTS: Record<OrderStatus, "default" | "secondary" | "destructive" | "outline"> = {
  pending_payment: "secondary",
  paid: "default",
  preparing: "default",
  shipped: "default",
  ready_for_pickup: "default",
  delivered: "outline",
  cancelled: "destructive",
  refunded: "destructive",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const t = useTranslations("Orders.status");
  return <Badge variant={VARIANTS[status]}>{t(status)}</Badge>;
}
