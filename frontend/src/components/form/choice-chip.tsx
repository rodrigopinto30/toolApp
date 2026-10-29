import { cn } from "cn";
import type { InputHTMLAttributes, ReactNode } from "react";

type ChoiceChipProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className"> & {
  label: ReactNode;
  muted?: boolean;
};

export function ChoiceChip({ label, muted = false, ...inputProps }: ChoiceChipProps) {
  return (
    <label
      className={cn(
        "cursor-pointer rounded-lg border border-input px-3 py-1.5 text-sm transition-colors select-none hover:bg-muted has-checked:border-primary has-checked:bg-primary has-checked:text-primary-foreground has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
        muted && "text-muted-foreground line-through has-checked:text-primary-foreground/80",
      )}
    >
      <input type="radio" className="sr-only" {...inputProps} />
      {label}
    </label>
  );
}
