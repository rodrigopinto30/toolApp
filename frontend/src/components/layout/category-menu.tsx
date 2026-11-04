"use client";

import { MenuIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { categoryPath } from "@/features/catalog/paths";
import { Link } from "@/i18n/navigation";

export type CategoryLink = { slug: string; name: string; children: { slug: string; name: string }[] };

export function CategoryMenu({ categories }: { categories: CategoryLink[] }) {
  const t = useTranslations("CategoryMenu");

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="chrome" size="lg" className="h-11">
          <MenuIcon aria-hidden="true" className="size-5" />
          <span className="sr-only sm:not-sr-only">{t("label")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {categories.map((category, index) => (
          <DropdownMenuGroup key={category.slug}>
            {index > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem asChild className="font-medium">
              <Link href={categoryPath(category.slug)}>{category.name}</Link>
            </DropdownMenuItem>
            {category.children.map((child) => (
              <DropdownMenuItem key={child.slug} asChild className="pl-6">
                <Link href={categoryPath(child.slug)}>{child.name}</Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
