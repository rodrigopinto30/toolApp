"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export function useResourceSheet<Item>() {
  const [editing, setEditing] = useState<Item | "new" | null>(null);
  return {
    open: editing !== null,
    item: editing === "new" ? undefined : (editing ?? undefined),
    add: () => setEditing("new"),
    edit: (item: Item) => setEditing(item),
    close: () => setEditing(null),
  };
}

export function ResourceSheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const t = useTranslations("Admin");

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent closeLabel={t("close")} className="gap-0 overflow-y-auto data-[side=right]:sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-4">{open && children}</div>
      </SheetContent>
    </Sheet>
  );
}
