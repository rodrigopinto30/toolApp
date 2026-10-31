"use client";

import { useFormatter, useTranslations } from "next-intl";
import { parseAsInteger, parseAsString, useQueryStates } from "nuqs";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DataTable, useAdminPage, type Column } from "@/features/admin/components/data-table";
import { ResourceHeader } from "@/features/admin/components/resource-parts";
import { endOfDay, startOfDay } from "@/features/admin/dates";
import { parseAsDay } from "@/features/admin/filters";
import { useAuditLogs } from "@/features/admin/hooks";
import type { AuditLog } from "@/features/admin/types";

const TEXT_MAX_LENGTH = 60;
const ENTITY_ID_MAX_LENGTH = 64;
const NO_VALUE = "—";

const FILTERS = {
  entity: parseAsString,
  entity_id: parseAsString,
  action: parseAsString,
  from: parseAsDay,
  to: parseAsDay,
  page: parseAsInteger,
};

export function auditValue(value: unknown): string {
  if (value === null || value === undefined) {
    return NO_VALUE;
  }
  return typeof value === "string" ? value : JSON.stringify(value);
}

function AuditChanges({ log }: { log: AuditLog }) {
  const t = useTranslations("Admin.audit");
  const changes = Object.entries(log.changes ?? {});

  if (changes.length === 0) {
    return NO_VALUE;
  }
  return (
    <details>
      <summary className="cursor-pointer">{t("changesCount", { count: changes.length })}</summary>
      <dl className="mt-2 grid gap-2">
        {changes.map(([field, change]) => (
          <div key={field} className="grid gap-0.5">
            <dt className="font-medium">{field}</dt>
            <dd className="wrap-anywhere text-muted-foreground">
              {t("before")}: {auditValue(change.before)}
            </dd>
            <dd className="wrap-anywhere">
              {t("after")}: {auditValue(change.after)}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

export function AuditView() {
  const t = useTranslations("Admin.audit");
  const format = useFormatter();
  const [filters, setFilters] = useQueryStates(FILTERS);
  const page = useAdminPage();
  const logs = useAuditLogs(page, {
    entity: filters.entity ?? undefined,
    entity_id: filters.entity_id ?? undefined,
    action: filters.action ?? undefined,
    date_from: filters.from ? startOfDay(filters.from) : undefined,
    date_to: filters.to ? endOfDay(filters.to) : undefined,
  });

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const { elements } = event.currentTarget;
    const value = (name: string) => (elements.namedItem(name) as HTMLInputElement).value.trim() || null;
    void setFilters({
      entity: value("entity"),
      entity_id: value("entity_id"),
      action: value("action"),
      from: value("from"),
      to: value("to"),
      page: null,
    });
  };

  const columns: Column<AuditLog>[] = [
    {
      header: t("date"),
      cell: (log) => format.dateTime(new Date(log.created_at), { dateStyle: "short", timeStyle: "medium" }),
    },
    { header: t("actor"), cell: (log) => log.actor_email ?? t("system") },
    { header: t("action"), cell: (log) => log.action },
    {
      header: t("entity"),
      cell: (log) => (log.entity_id ? t("entityWithId", { entity: log.entity, id: log.entity_id }) : log.entity),
    },
    { header: t("changes"), className: "min-w-64 whitespace-normal", cell: (log) => <AuditChanges log={log} /> },
  ];

  return (
    <div className="grid gap-4">
      <ResourceHeader title={t("title")} />
      <form
        key={JSON.stringify(filters)}
        aria-label={t("filters")}
        onSubmit={onSubmit}
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
      >
        {(["entity", "entity_id", "action"] as const).map((name) => (
          <div key={name} className="grid gap-2">
            <Label htmlFor={`audit-${name}`}>{t(name)}</Label>
            <Input
              id={`audit-${name}`}
              name={name}
              maxLength={name === "entity_id" ? ENTITY_ID_MAX_LENGTH : TEXT_MAX_LENGTH}
              defaultValue={filters[name] ?? ""}
            />
          </div>
        ))}
        {(["from", "to"] as const).map((name) => (
          <div key={name} className="grid gap-2">
            <Label htmlFor={`audit-${name}`}>{t(name)}</Label>
            <Input id={`audit-${name}`} name={name} type="date" defaultValue={filters[name] ?? ""} />
          </div>
        ))}
        <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-5">
          <Button type="submit" variant="outline" size="sm">
            {t("apply")}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => void setFilters(null)}>
            {t("clear")}
          </Button>
        </div>
      </form>
      <DataTable label={t("title")} columns={columns} rowKey={(log) => log.id} query={logs} emptyLabel={t("empty")} />
    </div>
  );
}
