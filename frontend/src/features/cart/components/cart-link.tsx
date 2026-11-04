"use client";

import { ShoppingCartIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { useCartCount } from "@/features/cart/hooks";
import { CART_PATH } from "@/features/cart/paths";
import { Link } from "@/i18n/navigation";

export function CartLink() {
  const t = useTranslations("CartLink");
  const count = useCartCount();

  return (
    <Button asChild variant="chrome-outline" size="lg">
      <Link href={CART_PATH} aria-label={count === undefined ? t("loading") : t("label", { count })}>
        <ShoppingCartIcon aria-hidden="true" />
        {count !== undefined && count > 0 && (
          <span aria-hidden="true" className="rounded-full bg-brand px-1.5 text-xs font-semibold text-brand-foreground tabular-nums">
            {count}
          </span>
        )}
      </Link>
    </Button>
  );
}
