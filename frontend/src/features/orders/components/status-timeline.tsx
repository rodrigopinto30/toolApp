import { cn } from "cn";

export function StatusTimeline<Item>({
  items,
  itemKey,
  children,
}: {
  items: Item[];
  itemKey: (item: Item) => string;
  children: (item: Item) => React.ReactNode;
}) {
  return (
    <ol className="grid text-sm">
      {items.map((item, index) => {
        const current = index === items.length - 1;
        return (
          <li key={itemKey(item)} className="relative grid gap-0.5 pb-4 pl-7 last:pb-0">
            {!current && <span aria-hidden="true" className="absolute top-4.5 -bottom-0.5 left-1.75 w-0.5 bg-input" />}
            <span
              aria-hidden="true"
              className={cn(
                "absolute top-0.5 left-0 size-4 rounded-full border-2",
                current ? "border-primary bg-brand" : "border-input bg-card",
              )}
            />
            {children(item)}
          </li>
        );
      })}
    </ol>
  );
}
