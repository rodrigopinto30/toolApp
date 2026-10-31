"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { parseAsInteger, useQueryState } from "nuqs";
import { useEffect } from "react";

import { FormAlert } from "@/components/form/form-alert";
import { Pagination } from "@/components/layout/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { PageOf } from "@/features/admin/types";
import { useErrorMessage } from "@/features/errors/use-error-message";
import { usePathname } from "@/i18n/navigation";

const MAX_PAGE = 100_000;
const SKELETON_ROWS = 3;

export type Column<Row> = {
  header: string;
  cell: (row: Row) => React.ReactNode;
  className?: string;
};

export function useAdminPage(): number {
  const [requested] = useQueryState("page", parseAsInteger.withDefault(1));
  return Math.min(Math.max(requested, 1), MAX_PAGE);
}

export function DataTable<Row>({
  label,
  columns,
  rowKey,
  query,
  emptyLabel,
}: {
  label: string;
  columns: Column<Row>[];
  rowKey: (row: Row) => React.Key;
  query: { data: PageOf<Row> | undefined; error: unknown };
  emptyLabel: string;
}) {
  const t = useTranslations("Admin");
  const errorMessage = useErrorMessage();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, setPage] = useQueryState("page", parseAsInteger.withDefault(1));
  const page = query.data?.page ?? 1;
  const lastPage = query.data?.pages ?? 0;

  useEffect(() => {
    if (lastPage > 0 && page > lastPage) {
      void setPage(lastPage);
    }
  }, [lastPage, page, setPage]);

  const href = (target: number) => {
    const params = new URLSearchParams(searchParams);
    if (target === 1) {
      params.delete("page");
    } else {
      params.set("page", String(target));
    }
    const search = params.toString();
    return search ? `${pathname}?${search}` : pathname;
  };

  if (query.error) {
    return <FormAlert message={errorMessage(query.error)} />;
  }
  if (!query.data) {
    return (
      <div aria-busy="true" aria-label={t("loadingList")} className="grid gap-2">
        {Array.from({ length: SKELETON_ROWS }, (_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </div>
    );
  }
  if (query.data.total === 0) {
    return <p className="rounded-lg border border-dashed px-4 py-12 text-center text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    <div className="grid min-w-0 grid-cols-1 gap-4">
      <div className="min-w-0 rounded-lg border">
        <Table aria-label={label}>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead key={column.header} className={column.className}>
                  {column.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.data.items.map((row) => (
              <TableRow key={rowKey(row)}>
                {columns.map((column) => (
                  <TableCell key={column.header} className={column.className}>
                    {column.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Pagination page={query.data.page} pages={query.data.pages} href={href} />
    </div>
  );
}
