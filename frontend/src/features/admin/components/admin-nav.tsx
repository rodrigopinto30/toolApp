"use client";

import { MenuIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  ADMIN_ATTRIBUTES_PATH,
  ADMIN_BRANDS_PATH,
  ADMIN_CATEGORIES_PATH,
  ADMIN_PRODUCTS_PATH,
} from "@/features/admin/catalog/paths";
import {
  ADMIN_AUDIT_PATH,
  ADMIN_COUPONS_PATH,
  ADMIN_EXCHANGE_RATES_PATH,
  ADMIN_ORDERS_PATH,
  ADMIN_PICKUP_POINTS_PATH,
  ADMIN_REVIEWS_PATH,
  ADMIN_SHIPPING_PATH,
  ADMIN_USERS_PATH,
} from "@/features/admin/paths";
import { Link, usePathname } from "@/i18n/navigation";

const SECTIONS = [
  { href: ADMIN_ORDERS_PATH, label: "orders" },
  { href: ADMIN_PRODUCTS_PATH, label: "products" },
  { href: ADMIN_CATEGORIES_PATH, label: "categories" },
  { href: ADMIN_BRANDS_PATH, label: "brands" },
  { href: ADMIN_ATTRIBUTES_PATH, label: "attributes" },
  { href: ADMIN_COUPONS_PATH, label: "coupons" },
  { href: ADMIN_EXCHANGE_RATES_PATH, label: "exchangeRates" },
  { href: ADMIN_SHIPPING_PATH, label: "shipping" },
  { href: ADMIN_PICKUP_POINTS_PATH, label: "pickupPoints" },
  { href: ADMIN_REVIEWS_PATH, label: "reviews" },
  { href: ADMIN_USERS_PATH, label: "users" },
  { href: ADMIN_AUDIT_PATH, label: "audit" },
] as const;

function SectionLinks({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTranslations("Admin.nav");
  const pathname = usePathname();

  return (
    <ul className="grid gap-1">
      {SECTIONS.map(({ href, label }) => {
        const current = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <li key={href}>
            <Button asChild variant={current ? "secondary" : "ghost"} size="sm" className="w-full justify-start">
              <Link href={href} aria-current={current ? "page" : undefined} onClick={onNavigate}>
                {t(label)}
              </Link>
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

export function AdminNav() {
  const t = useTranslations("Admin.nav");
  const [open, setOpen] = useState(false);

  return (
    <>
      <nav aria-label={t("label")} className="hidden lg:block">
        <SectionLinks />
      </nav>
      <div className="lg:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm">
              <MenuIcon aria-hidden="true" />
              {t("open")}
            </Button>
          </SheetTrigger>
          <SheetContent side="left" closeLabel={t("close")} className="gap-0">
            <SheetHeader>
              <SheetTitle>{t("label")}</SheetTitle>
            </SheetHeader>
            <nav aria-label={t("label")} className="px-4 pb-4">
              <SectionLinks onNavigate={() => setOpen(false)} />
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
