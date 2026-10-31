"use client";

import { cn } from "cn";
import { StarIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { RATINGS } from "@/features/reviews/schemas";

export function StarInput({
  id,
  name,
  legend,
  value,
  error,
  onChange,
  onBlur,
}: {
  id: string;
  name: string;
  legend: string;
  value: number;
  error?: string;
  onChange: (value: number) => void;
  onBlur?: () => void;
}) {
  const t = useTranslations("Reviews");
  const errorId = error ? `${id}-error` : undefined;

  return (
    <fieldset aria-describedby={errorId} className="grid gap-2">
      <legend className="text-sm leading-none font-medium">{legend}</legend>
      <div className="flex w-fit gap-0.5 pt-2">
        {RATINGS.map((rating) => (
          <label
            key={rating}
            className="relative cursor-pointer rounded-md p-1 transition-colors hover:bg-muted has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
          >
            <input
              type="radio"
              name={name}
              value={rating}
              checked={value === rating}
              className="peer sr-only"
              onChange={() => onChange(rating)}
              onBlur={onBlur}
            />
            <StarIcon
              aria-hidden="true"
              className={cn("size-7", rating <= value ? "fill-current" : "text-muted-foreground")}
            />
            <span className="sr-only">{t("stars", { count: rating })}</span>
          </label>
        ))}
      </div>
      {error && (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
}
