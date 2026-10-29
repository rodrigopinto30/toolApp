"use client";

import { usePathname, useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useEffect } from "react";

import { ApiError } from "@/lib/api/errors";

import { useMe } from "./hooks";
import { useSession } from "./session-provider";

export function useProtectedMe() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const { hasSession } = useSession();
  const me = useMe();
  const unauthenticated = !hasSession || (me.error instanceof ApiError && me.error.status === 401);

  useEffect(() => {
    if (unauthenticated) {
      router.replace(`/${locale}/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [unauthenticated, router, locale, pathname]);

  return { me, unauthenticated };
}
