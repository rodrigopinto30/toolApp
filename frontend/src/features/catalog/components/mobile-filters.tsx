"use client";

import { SlidersHorizontalIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export function MobileFilters({ children }: { children: React.ReactNode }) {
  const t = useTranslations("Listing");

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="lg:hidden">
          <SlidersHorizontalIcon aria-hidden="true" />
          {t("filters")}
        </Button>
      </SheetTrigger>
      <SheetContent side="left" closeLabel={t("closeFilters")} className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t("filters")}</SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-6">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
