import { cn } from "cn";
import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid justify-items-center gap-3 rounded-xl border border-dashed border-input px-4 py-12 text-center",
        className,
      )}
    >
      {Icon && (
        <span className="grid size-12 place-items-center rounded-full bg-brand text-brand-foreground">
          <Icon aria-hidden="true" className="size-6" />
        </span>
      )}
      {title && <h2 className="text-lg font-semibold">{title}</h2>}
      {description && <p className="max-w-prose text-muted-foreground">{description}</p>}
      {action}
    </div>
  );
}
