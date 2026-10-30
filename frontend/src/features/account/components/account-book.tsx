"use client";

import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { ConfirmAction } from "@/components/form/confirm-action";
import { FormAlert } from "@/components/form/form-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useErrorMessage } from "@/features/errors/use-error-message";
import { useProtectedMe } from "@/features/session/use-protected-me";

type Entry = { id: number; is_default: boolean };

type BookLabels = {
  title: string;
  add: string;
  addTitle: string;
  editTitle: string;
  empty: string;
  loading: string;
  deleteTitle: (name: string) => string;
  deleteDescription: string;
};

export function AccountBook<Item extends Entry>({
  labels,
  items,
  remove,
  setDefault,
  nameOf,
  details,
  form,
}: {
  labels: BookLabels;
  items: UseQueryResult<Item[]>;
  remove: UseMutationResult<unknown, Error, number>;
  setDefault: UseMutationResult<unknown, Error, number>;
  nameOf: (item: Item) => string;
  details: (item: Item) => React.ReactNode;
  form: (item: Item | undefined, close: () => void) => React.ReactNode;
}) {
  const t = useTranslations("Account.book");
  const errorMessage = useErrorMessage();
  useProtectedMe();
  const [editing, setEditing] = useState<Item | "new" | null>(null);
  const close = () => setEditing(null);
  const failure = items.error ?? remove.error ?? setDefault.error;
  const item = editing === "new" ? undefined : (editing ?? undefined);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{labels.title}</h1>
        <Button onClick={() => setEditing("new")}>{labels.add}</Button>
      </div>
      <FormAlert message={failure ? errorMessage(failure) : undefined} />
      {!items.data && !items.error && (
        <div aria-busy="true" aria-label={labels.loading} className="grid gap-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      )}
      {items.data?.length === 0 && (
        <p className="rounded-lg border border-dashed px-4 py-12 text-center text-muted-foreground">{labels.empty}</p>
      )}
      {items.data && items.data.length > 0 && (
        <ul className="grid gap-3">
          {items.data.map((entry) => {
            const name = nameOf(entry);
            return (
              <li key={entry.id}>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex flex-wrap items-center gap-2">
                      {name}
                      {entry.is_default && <Badge variant="secondary">{t("default")}</Badge>}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    <div className="grid gap-1 text-muted-foreground">{details(entry)}</div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={t("editItem", { name })}
                        onClick={() => setEditing(entry)}
                      >
                        {t("edit")}
                      </Button>
                      {!entry.is_default && (
                        <Button
                          variant="outline"
                          size="sm"
                          aria-label={t("makeDefaultItem", { name })}
                          disabled={setDefault.isPending}
                          onClick={() => setDefault.mutate(entry.id)}
                        >
                          {t("makeDefault")}
                        </Button>
                      )}
                      <ConfirmAction
                        label={t("delete")}
                        accessibleLabel={t("deleteItem", { name })}
                        title={labels.deleteTitle(name)}
                        description={labels.deleteDescription}
                        confirmLabel={t("confirmDelete")}
                        pendingLabel={t("deleting")}
                        cancelLabel={t("keep")}
                        pending={remove.isPending}
                        size="sm"
                        onConfirm={(done) => remove.mutate(entry.id, { onSettled: done })}
                      />
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      <Sheet open={editing !== null} onOpenChange={(open) => !open && close()}>
        <SheetContent closeLabel={t("close")} className="gap-0 overflow-y-auto data-[side=right]:sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{item ? labels.editTitle : labels.addTitle}</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-4">{editing !== null && form(item, close)}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
