"use client";

import { useTranslations } from "next-intl";

import type { components } from "@/lib/api/schema";

const OPENING_DAYS = ["mon_fri", "sat", "sun"] as const;

export type PickupPoint = components["schemas"]["PickupPointRead"];

export function PickupPointDetails({ point, showName = true }: { point: PickupPoint; showName?: boolean }) {
  const t = useTranslations("Product.shipping");
  const dayLabel = (day: string) => {
    const known = OPENING_DAYS.find((candidate) => candidate === day);
    return known ? t(`hours.${known}`) : day;
  };

  return (
    <span className="grid gap-0.5">
      {showName && <span className="font-medium">{point.name}</span>}
      <span className="text-muted-foreground">{point.address}</span>
      {Object.entries(point.hours ?? {}).map(([day, hours]) => (
        <span key={day} className="text-muted-foreground">
          {dayLabel(day)}: {hours}
        </span>
      ))}
    </span>
  );
}
