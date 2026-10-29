"use client";

import { CheckIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PRICE_PARAMS } from "@/features/catalog/search-params";
import { CURRENCIES, saveCurrency, type Currency } from "@/lib/currency";

export function CurrencySwitcher({ value }: { value: Currency }) {
  const t = useTranslations("CurrencySwitcher");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function switchTo(next: Currency) {
    saveCurrency(next);
    if (!PRICE_PARAMS.some((key) => searchParams.has(key))) {
      startTransition(() => router.refresh());
      return;
    }
    const params = new URLSearchParams(searchParams);
    [...PRICE_PARAMS, "page"].forEach((key) => params.delete(key));
    startTransition(() => {
      router.replace(params.size ? `${pathname}?${params}` : pathname, { scroll: false });
      router.refresh();
    });
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
