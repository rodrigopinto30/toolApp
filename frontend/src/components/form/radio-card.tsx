import type { InputHTMLAttributes } from "react";

type RadioCardProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className" | "children"> & {
  title: string;
  children?: React.ReactNode;
};

export function RadioCard({ title, children, ...inputProps }: RadioCardProps) {
  return (
    <label className="flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors has-checked:border-primary has-checked:bg-primary/5 has-focus-visible:ring-3 has-focus-visible:ring-ring/50 has-disabled:cursor-not-allowed has-disabled:opacity-60">
      <input type="radio" className="mt-1 size-4 accent-primary" {...inputProps} />
      <span className="grid gap-0.5 text-sm">
        <span className="font-medium">{title}</span>
        {children && <span className="text-muted-foreground">{children}</span>}
      </span>
    </label>
  );
}
