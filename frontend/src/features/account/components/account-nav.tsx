"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { ACCOUNT_PATH, ADDRESSES_PATH, BILLING_PATH } from "@/features/account/paths";
import { ORDERS_PATH } from "@/features/orders/paths";
import { Link, usePathname } from "@/i18n/navigation";

export function AccountNav() {
  const t = useTranslations("Account.nav");
  const pathname = usePathname();
  const links = [
    { href: ACCOUNT_PATH, label: t("profile"), current: pathname === ACCOUNT_PATH },
    { href: ORDERS_PATH, label: t("orders"), current: pathname.startsWith(ORDERS_PATH) },
    { href: ADDRESSES_PATH, label: t("addresses"), current: pathname === ADDRESSES_PATH },
    { href: BILLING_PATH, label: t("billing"), current: pathname === BILLING_PATH },
  ];

  return (
    <nav aria-label={t("label")} className="flex flex-wrap gap-1 border-b pb-2">
      {links.map(({ href, label, current }) => (
        <Button key={href} asChild variant={current ? "secondary" : "ghost"} size="sm">
          <Link href={href} aria-current={current ? "page" : undefined}>
            {label}
          </Link>
        </Button>
      ))}
    </nav>
  );
}
