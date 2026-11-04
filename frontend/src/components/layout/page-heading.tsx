import { cn } from "cn";

export function PageHeading({ className, ...props }: React.ComponentProps<"h1">) {
  return <h1 className={cn("text-2xl font-extrabold tracking-tight uppercase sm:text-3xl", className)} {...props} />;
}
