"use client";

import { CheckIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CURRENCIES, saveCurrency, type Currency } from "@/lib/currency";

export function CurrencySwitcher({ value }: { value: Currency }) {
  const t = useTranslations("CurrencySwitcher");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function switchTo(next: Currency) {
    saveCurrency(next);
    startTransition(() => router.refresh());
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" disabled={isPending} aria-label={t("label")}>
          {value}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {CURRENCIES.map((option) => (
          <DropdownMenuItem key={option} onSelect={() => switchTo(option)}>
            {t(option)}
            {option === value && <CheckIcon aria-hidden="true" className="ml-auto" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
