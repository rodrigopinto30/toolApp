"use client";

import type { ComponentProps } from "react";

import { Button } from "@/components/ui/button";
import { useHydrated } from "@/lib/use-hydrated";

type SubmitButtonProps = Omit<ComponentProps<typeof Button>, "type" | "asChild"> & {
  pending?: boolean;
  pendingLabel: string;
};

export function SubmitButton({ pending = false, pendingLabel, disabled, children, ...props }: SubmitButtonProps) {
  const hydrated = useHydrated();

  return (
    <Button type="submit" disabled={!hydrated || pending || disabled} {...props}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
