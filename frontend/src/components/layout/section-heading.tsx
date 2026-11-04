import { cn } from "cn";

export function SectionHeading({
  id,
  className,
  children,
}: {
  id?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <h2 id={id} className={cn("text-xl font-bold tracking-wide uppercase", className)}>
      {children}
    </h2>
  );
}
