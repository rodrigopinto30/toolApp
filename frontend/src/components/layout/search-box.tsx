"use client";

import { cn } from "cn";
import { SearchIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useRef, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QUERY_MIN_LENGTH } from "@/features/catalog/search-params";
import { usePathname, useRouter } from "@/i18n/navigation";

const SEARCH_PATH = "/search";

export function SearchBox({ className }: { className?: string }) {
  const t = useTranslations("SearchBox");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = pathname === SEARCH_PATH ? (searchParams.get("q") ?? "") : "";
  const input = useRef<HTMLInputElement>(null);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push({ pathname: SEARCH_PATH, query: { q: input.current?.value.trim() ?? "" } });
  }

  return (
    <form
      role="search"
      action={`/${locale}${SEARCH_PATH}`}
      method="get"
      onSubmit={search}
      className={cn("flex items-center gap-1", className)}
    >
      <Input
        ref={input}
        key={current}
        type="search"
        name="q"
        defaultValue={current}
        required
        minLength={QUERY_MIN_LENGTH}
        maxLength={100}
        aria-label={t("label")}
        placeholder={t("placeholder")}
      />
      <Button type="submit" variant="ghost" size="icon" aria-label={t("submit")}>
        <SearchIcon aria-hidden="true" />
      </Button>
    </form>
  );
}
