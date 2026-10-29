"use client";

import { useState, type ComponentProps } from "react";

import { Link } from "@/i18n/navigation";

export function HoverPrefetchLink({ onMouseEnter, onFocus, ...props }: Omit<ComponentProps<typeof Link>, "prefetch">) {
  const [intent, setIntent] = useState(false);

  return (
    <Link
      {...props}
      prefetch={intent}
      onMouseEnter={(event) => {
        setIntent(true);
        onMouseEnter?.(event);
      }}
      onFocus={(event) => {
        setIntent(true);
        onFocus?.(event);
      }}
    />
  );
}
