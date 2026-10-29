"use client";

import { cn } from "cn";
import { createContext, useContext, useTransition, type TransitionStartFunction } from "react";

type ListingContextValue = { isPending: boolean; startTransition: TransitionStartFunction };

const ListingContext = createContext<ListingContextValue | null>(null);

export function ListingProvider({ children }: { children: React.ReactNode }) {
  const [isPending, startTransition] = useTransition();

  return <ListingContext value={{ isPending, startTransition }}>{children}</ListingContext>;
}

export function useListing(): ListingContextValue {
  const value = useContext(ListingContext);
  if (!value) {
    throw new Error("useListing must be used inside ListingProvider");
  }
  return value;
}

export function ListingResults({ children }: { children: React.ReactNode }) {
  const { isPending } = useListing();

  return (
    <div aria-busy={isPending} className={cn("transition-opacity", isPending && "opacity-60")}>
      {children}
    </div>
  );
}
