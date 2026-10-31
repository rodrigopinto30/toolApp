"use client";

import { useFormatter, useTranslations } from "next-intl";
import { parseAsInteger, parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";

import { ConfirmAction } from "@/components/form/confirm-action";
import { FormAlert } from "@/components/form/form-alert";
import { SelectField } from "@/components/form/select-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NO_VALUE } from "@/features/admin/catalog/schemas";
import { DataTable, useAdminPage, type Column } from "@/features/admin/components/data-table";
import { ActiveBadge, ResourceHeader } from "@/features/admin/components/resource-parts";
import { useAdminUsers, useUpdateUser } from "@/features/admin/operations/hooks";
import type { AdminUser } from "@/features/admin/operations/types";
import { useErrorMessage } from "@/features/errors/use-error-message";
import { useMe } from "@/features/session/hooks";

const ROLES = ["customer", "admin"] as const;
const STATUSES = ["active", "inactive"] as const;
const SEARCH_MIN_LENGTH = 2;
const SEARCH_MAX_LENGTH = 100;

const FILTERS = {
  q: parseAsString,
  role: parseAsStringLiteral(ROLES),
  status: parseAsStringLiteral(STATUSES),
  page: parseAsInteger,
};

export function UsersView() {
  const t = useTranslations("Admin.users");
  const ta = useTranslations("Admin");
  const format = useFormatter();
  const errorMessage = useErrorMessage();
  const me = useMe();
  const [filters, setFilters] = useQueryStates(FILTERS);
  const page = useAdminPage();
  const users = useAdminUsers(page, {
    q: filters.q && filters.q.length >= SEARCH_MIN_LENGTH ? filters.q : undefined,
    role: filters.role ?? undefined,
    is_active: filters.status ? filters.status === "active" : undefined,
  });
  const update = useUpdateUser();

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const input = event.currentTarget.elements.namedItem("q") as HTMLInputElement;
    void setFilters({ q: input.value.trim() || null, page: null });
  };

  const columns: Column<AdminUser>[] = [
    {
      header: t("user"),
      className: "min-w-48 whitespace-normal",
      cell: (user) => (
        <span className="grid gap-0.5">
          <span className="flex flex-wrap items-center gap-2">
            {user.first_name} {user.last_name}
            {user.id === me.data?.id && <Badge variant="outline">{t("you")}</Badge>}
            {!user.email_verified_at && <Badge variant="outline">{t("unverified")}</Badge>}
          </span>
          <span className="text-xs wrap-anywhere text-muted-foreground">{user.email}</span>
        </span>
      ),
    },
    { header: t("role"), cell: (user) => t(`roles.${user.role}`) },
    { header: t("status"), cell: (user) => <ActiveBadge active={user.is_active} /> },
    {
      header: t("lastLogin"),
      cell: (user) =>
        user.last_login_at
          ? format.dateTime(new Date(user.last_login_at), { dateStyle: "short", timeStyle: "short" })
          : t("never"),
    },
    {
      header: t("actions"),
      className: "text-right",
      cell: (user) => {
        if (user.id === me.data?.id) {
          return null;
        }
        const name = user.email;
        const isAdmin = user.role === "admin";
        return (
          <div className="flex justify-end gap-2">
            <ConfirmAction
              label={t(isAdmin ? "removeAdmin" : "makeAdmin")}
              accessibleLabel={t(isAdmin ? "removeAdminItem" : "makeAdminItem", { name })}
              title={t(isAdmin ? "removeAdminTitle" : "makeAdminTitle", { name })}
              description={t(isAdmin ? "removeAdminDescription" : "makeAdminDescription")}
              confirmLabel={t("confirm")}
              pendingLabel={ta("saving")}
              cancelLabel={ta("cancel")}
              pending={update.isPending}
              size="sm"
              onConfirm={(done) =>
                update.mutate({ id: user.id, role: isAdmin ? "customer" : "admin" }, { onSettled: done })
              }
            />
            {user.is_active ? (
              <ConfirmAction
                label={t("deactivate")}
                accessibleLabel={t("deactivateItem", { name })}
                title={t("deactivateTitle", { name })}
                description={t("deactivateDescription")}
                confirmLabel={t("confirm")}
                pendingLabel={ta("saving")}
                cancelLabel={ta("cancel")}
                pending={update.isPending}
                size="sm"
                onConfirm={(done) => update.mutate({ id: user.id, is_active: false }, { onSettled: done })}
              />
            ) : (
              <Button
                variant="outline"
                size="sm"
                aria-label={t("activateItem", { name })}
                disabled={update.isPending}
                onClick={() => update.mutate({ id: user.id, is_active: true })}
              >
                {t("activate")}
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="grid gap-4">
      <ResourceHeader title={t("title")} />
      <div className="grid items-end gap-3 sm:grid-cols-3">
        <form key={filters.q ?? ""} role="search" aria-label={t("search")} onSubmit={onSubmit} className="grid gap-2">
          <Label htmlFor="admin-users-q">{t("search")}</Label>
          <Input
            id="admin-users-q"
            name="q"
            type="search"
            minLength={SEARCH_MIN_LENGTH}
            maxLength={SEARCH_MAX_LENGTH}
            defaultValue={filters.q ?? ""}
          />
        </form>
        <SelectField
          id="admin-users-role"
          label={t("role")}
          options={[
            { value: NO_VALUE, label: t("all") },
            ...ROLES.map((value) => ({ value, label: t(`roles.${value}`) })),
          ]}
          value={filters.role ?? NO_VALUE}
          onChange={(value) =>
            void setFilters({ role: value === NO_VALUE ? null : (value as (typeof ROLES)[number]), page: null })
          }
        />
        <SelectField
          id="admin-users-status"
          label={t("status")}
          options={[
            { value: NO_VALUE, label: t("all") },
            { value: "active", label: ta("active") },
            { value: "inactive", label: ta("inactive") },
          ]}
          value={filters.status ?? NO_VALUE}
          onChange={(value) =>
            void setFilters({ status: value === NO_VALUE ? null : (value as (typeof STATUSES)[number]), page: null })
          }
        />
      </div>
      <FormAlert message={update.error ? errorMessage(update.error) : undefined} />
      <DataTable label={t("title")} columns={columns} rowKey={(user) => user.id} query={users} emptyLabel={t("empty")} />
    </div>
  );
}
