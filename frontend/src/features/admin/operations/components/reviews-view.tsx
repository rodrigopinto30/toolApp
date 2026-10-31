"use client";

import { useFormatter, useLocale, useTranslations } from "next-intl";
import { parseAsInteger, parseAsStringLiteral, useQueryStates } from "nuqs";

import { FormAlert } from "@/components/form/form-alert";
import { SelectField } from "@/components/form/select-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, useAdminPage, type Column } from "@/features/admin/components/data-table";
import { ResourceHeader } from "@/features/admin/components/resource-parts";
import { useAdminReviews, useModerateReview } from "@/features/admin/operations/hooks";
import type { AdminReview } from "@/features/admin/operations/types";
import { productPath } from "@/features/catalog/paths";
import { useErrorMessage } from "@/features/errors/use-error-message";
import { ReviewStars } from "@/features/reviews/components/review-stars";
import type { ReviewStatus } from "@/features/reviews/types";
import type { Locale } from "@/i18n/locales";
import { Link } from "@/i18n/navigation";

const REVIEW_STATUSES = ["pending", "approved", "rejected"] as const satisfies readonly ReviewStatus[];
const ALL = "all";
const FILTER_VALUES = [...REVIEW_STATUSES, ALL] as const;
const STATUS_VARIANTS = {
  pending: "secondary",
  approved: "outline",
  rejected: "destructive",
} as const satisfies Record<ReviewStatus, string>;

const FILTERS = {
  status: parseAsStringLiteral(FILTER_VALUES).withDefault("pending"),
  page: parseAsInteger,
};

export function ReviewsView() {
  const t = useTranslations("Admin.reviews");
  const locale = useLocale() as Locale;
  const format = useFormatter();
  const errorMessage = useErrorMessage();
  const [filters, setFilters] = useQueryStates(FILTERS);
  const page = useAdminPage();
  const reviews = useAdminReviews(page, filters.status === ALL ? undefined : filters.status);
  const moderate = useModerateReview();

  const columns: Column<AdminReview>[] = [
    {
      header: t("product"),
      className: "min-w-40 whitespace-normal",
      cell: (review) => (
        <span className="grid gap-1">
          <Link href={productPath(review.product.slug)} className="underline-offset-4 hover:underline">
            {review.product.name[locale]}
          </Link>
          <span className="grid text-xs wrap-anywhere text-muted-foreground">
            <span>
              {review.author.first_name} {review.author.last_name}
            </span>
            <span>{review.author.email}</span>
          </span>
        </span>
      ),
    },
    {
      header: t("review"),
      className: "min-w-64 whitespace-normal",
      cell: (review) => (
        <div className="grid gap-1">
          <ReviewStars rating={review.rating} />
          <p className="font-medium wrap-anywhere">{review.title}</p>
          <p className="whitespace-pre-line wrap-anywhere text-muted-foreground">{review.body}</p>
        </div>
      ),
    },
    { header: t("date"), cell: (review) => format.dateTime(new Date(review.created_at), { dateStyle: "short" }) },
    {
      header: t("status"),
      cell: (review) => <Badge variant={STATUS_VARIANTS[review.status]}>{t(`statuses.${review.status}`)}</Badge>,
    },
    {
      header: t("actions"),
      className: "text-right",
      cell: (review) => (
        <div className="flex justify-end gap-2">
          {review.status !== "approved" && (
            <Button
              size="sm"
              aria-label={t("approveItem", { title: review.title })}
              disabled={moderate.isPending}
              onClick={() => moderate.mutate({ id: review.id, approve: true })}
            >
              {t("approve")}
            </Button>
          )}
          {review.status !== "rejected" && (
            <Button
              variant="outline"
              size="sm"
              aria-label={t("rejectItem", { title: review.title })}
              disabled={moderate.isPending}
              onClick={() => moderate.mutate({ id: review.id, approve: false })}
            >
              {t("reject")}
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="grid gap-4">
      <ResourceHeader title={t("title")} />
      <div className="sm:max-w-xs">
        <SelectField
          id="admin-reviews-status"
          label={t("status")}
          options={FILTER_VALUES.map((value) => ({
            value,
            label: value === ALL ? t("allStatuses") : t(`statuses.${value}`),
          }))}
          value={filters.status}
          onChange={(value) => void setFilters({ status: value as (typeof FILTER_VALUES)[number], page: null })}
        />
      </div>
      <FormAlert message={moderate.error ? errorMessage(moderate.error) : undefined} />
      <DataTable
        label={t("title")}
        columns={columns}
        rowKey={(review) => review.id}
        query={reviews}
        emptyLabel={t("empty")}
      />
    </div>
  );
}
