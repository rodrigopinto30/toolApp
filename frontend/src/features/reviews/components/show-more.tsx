"use client";

import { useTranslations } from "next-intl";

import { FormAlert } from "@/components/form/form-alert";
import { Button } from "@/components/ui/button";
import { useErrorMessage } from "@/features/errors/use-error-message";

export function ShowMore({
  query,
  label,
}: {
  query: {
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    isFetchNextPageError: boolean;
    error: unknown;
    fetchNextPage: () => Promise<unknown>;
  };
  label: string;
}) {
  const t = useTranslations("Reviews");
  const errorMessage = useErrorMessage();

  if (!query.hasNextPage) {
    return null;
  }
  return (
    <div className="grid gap-2">
      <FormAlert message={query.isFetchNextPageError ? errorMessage(query.error) : undefined} />
      <Button
        variant="outline"
        size="sm"
        className="w-fit"
        disabled={query.isFetchingNextPage}
        onClick={() => void query.fetchNextPage()}
      >
        {query.isFetchingNextPage ? t("loadingMore") : label}
      </Button>
    </div>
  );
}
