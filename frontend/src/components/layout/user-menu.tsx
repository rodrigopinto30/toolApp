"use client";

import { UserIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { ADMIN_PATH } from "@/features/admin/paths";
import { ORDERS_PATH } from "@/features/orders/paths";
import { useLogout, useMe } from "@/features/session/hooks";
import { useSession } from "@/features/session/session-provider";
import { Link } from "@/i18n/navigation";

export function UserMenu() {
  const t = useTranslations("UserMenu");
  const { hasSession } = useSession();
  const me = useMe();
  const logout = useLogout();

  if (!hasSession || me.isError) {
    return (
      <Button asChild variant="outline" size="sm">
        <Link href="/login">{t("login")}</Link>
      </Button>
    );
  }

  if (!me.data) {
    return <Skeleton className="h-8 w-24" aria-label={t("loading")} />;
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={t("label")}>
          <UserIcon aria-hidden="true" />
          {me.data.first_name}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="font-normal">
          <span className="block text-sm font-medium">
            {me.data.first_name} {me.data.last_name}
          </span>
          <span className="block text-xs text-muted-foreground">{me.data.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/account">{t("account")}</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={ORDERS_PATH}>{t("orders")}</Link>
        </DropdownMenuItem>
        {me.data.role === "admin" && (
          <DropdownMenuItem asChild>
            <Link href={ADMIN_PATH}>{t("admin")}</Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem disabled={logout.isPending} onSelect={() => logout.mutate()}>
          {t("logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
