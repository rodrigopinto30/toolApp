"use client";

import { useLocale, useTranslations } from "next-intl";
import { parseAsInteger, parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";

import { SelectField } from "@/components/form/select-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAdminBrands, useAdminCategories, useAdminProducts } from "@/features/admin/catalog/hooks";
import { ADMIN_NEW_PRODUCT_PATH, adminProductPath } from "@/features/admin/catalog/paths";
import { NO_VALUE } from "@/features/admin/catalog/schemas";
import { flattenTree } from "@/features/admin/catalog/tree";
import type { AdminProductSummary } from "@/features/admin/catalog/types";
import { DataTable, useAdminPage, type Column } from "@/features/admin/components/data-table";
import { ActiveBadge, ResourceHeader } from "@/features/admin/components/resource-parts";
import type { Locale } from "@/i18n/locales";
import { Link } from "@/i18n/navigation";
import { formatMoney } from "@/lib/money";

const STATUSES = ["active", "archived"] as const;
const SEARCH_MIN_LENGTH = 2;
const SEARCH_MAX_LENGTH = 100;

const FILTERS = {
  q: parseAsString,
  category: parseAsInteger,
  brand: parseAsInteger,
  status: parseAsStringLiteral(STATUSES),
  page: parseAsInteger,
};

export function ProductsView() {
  const t = useTranslations("Admin.products");
  const locale = useLocale() as Locale;
  const [filters, setFilters] = useQueryStates(FILTERS);
  const page = useAdminPage();
  const categories = useAdminCategories();
  const brands = useAdminBrands();
  const products = useAdminProducts(page, {
    q: filters.q && filters.q.length >= SEARCH_MIN_LENGTH ? filters.q : undefined,
    category_id: filters.category ?? undefined,
    brand_id: filters.brand ?? undefined,
    is_active: filters.status ? filters.status === "active" : undefined,
  });
  const categoryName = (id: number) => categories.data?.items.find((item) => item.id === id)?.name[locale] ?? "";
  const brandName = (id: number | null) => brands.data?.items.find((item) => item.id === id)?.name ?? t("noBrand");

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const input = event.currentTarget.elements.namedItem("q") as HTMLInputElement;
    void setFilters({ q: input.value.trim() || null, page: null });
  };

  const columns: Column<AdminProductSummary>[] = [
    {
      header: t("name"),
      cell: (product) => (
        <span className="flex items-center gap-2">
          <Link href={adminProductPath(product.id)} className="font-medium underline-offset-4 hover:underline">
            {product.name}
          </Link>
          {product.is_featured && <Badge variant="outline">{t("featured")}</Badge>}
        </span>
      ),
    },
    { header: t("category"), cell: (product) => categoryName(product.category_id) },
    { header: t("brand"), cell: (product) => brandName(product.brand_id) },
    {
      header: t("priceFrom"),
      cell: (product) =>
        product.price_from_usd ? formatMoney({ amount: product.price_from_usd, currency: "USD" }, locale) : t("noPrice"),
    },
    { header: t("stock"), cell: (product) => product.stock },
    { header: t("variants"), cell: (product) => product.variant_count },
    { header: t("status"), cell: (product) => <ActiveBadge active={product.is_active} /> },
  ];

  return (
    <div className="grid gap-4">
      <ResourceHeader title={t("title")}>
        <Button asChild>
          <Link href={ADMIN_NEW_PRODUCT_PATH}>{t("add")}</Link>
        </Button>
      </ResourceHeader>
      <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <form key={filters.q ?? ""} role="search" aria-label={t("search")} onSubmit={onSubmit} className="grid gap-2">
          <Label htmlFor="admin-products-q">{t("search")}</Label>
          <Input
            id="admin-products-q"
            name="q"
            type="search"
            minLength={SEARCH_MIN_LENGTH}
            maxLength={SEARCH_MAX_LENGTH}
            defaultValue={filters.q ?? ""}
          />
        </form>
        <SelectField
          id="admin-products-category"
          label={t("category")}
          options={[
            { value: NO_VALUE, label: t("all") },
            ...flattenTree(categories.data?.items ?? []).map(({ category, depth }) => ({
              value: String(category.id),
              label: `${"— ".repeat(depth)}${category.name[locale]}`,
            })),
          ]}
          value={filters.category ? String(filters.category) : NO_VALUE}
          onChange={(value) => void setFilters({ category: value === NO_VALUE ? null : Number(value), page: null })}
        />
        <SelectField
          id="admin-products-brand"
          label={t("brand")}
          options={[
            { value: NO_VALUE, label: t("all") },
            ...(brands.data?.items ?? []).map((brand) => ({ value: String(brand.id), label: brand.name })),
          ]}
          value={filters.brand ? String(filters.brand) : NO_VALUE}
          onChange={(value) => void setFilters({ brand: value === NO_VALUE ? null : Number(value), page: null })}
        />
        <SelectField
          id="admin-products-status"
          label={t("status")}
          options={[
            { value: NO_VALUE, label: t("all") },
            { value: "active", label: t("activeOnly") },
            { value: "archived", label: t("archivedOnly") },
          ]}
          value={filters.status ?? NO_VALUE}
          onChange={(value) =>
            void setFilters({ status: value === NO_VALUE ? null : (value as (typeof STATUSES)[number]), page: null })
          }
        />
      </div>
      <DataTable
        label={t("title")}
        columns={columns}
        rowKey={(product) => product.id}
        query={products}
        emptyLabel={t("empty")}
      />
    </div>
  );
}
