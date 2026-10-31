"use client";

import { useTranslations } from "next-intl";

import { ConfirmAction } from "@/components/form/confirm-action";
import { SubmitButton } from "@/components/form/submit-button";
import { TextField } from "@/components/form/text-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { UseFormRegisterReturn } from "react-hook-form";

export function ResourceHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {children}
    </div>
  );
}

export function ActiveBadge({ active }: { active: boolean }) {
  const t = useTranslations("Admin");
  return <Badge variant={active ? "secondary" : "outline"}>{t(active ? "active" : "inactive")}</Badge>;
}

export function FormActions({ pending, onCancel }: { pending: boolean; onCancel: () => void }) {
  const t = useTranslations("Admin");

  return (
    <div className="flex flex-wrap gap-2">
      <SubmitButton pending={pending} pendingLabel={t("saving")}>
        {t("save")}
      </SubmitButton>
      <Button type="button" variant="ghost" onClick={onCancel}>
        {t("cancel")}
      </Button>
    </div>
  );
}

export function RowActions({
  name,
  onEdit,
  deleteDescription,
  deleting,
  onDelete,
}: {
  name: string;
  onEdit: () => void;
  deleteDescription: string;
  deleting: boolean;
  onDelete: (done: () => void) => void;
}) {
  const t = useTranslations("Admin");

  return (
    <div className="flex justify-end gap-2">
      <Button variant="outline" size="sm" aria-label={t("editItem", { name })} onClick={onEdit}>
        {t("edit")}
      </Button>
      <ConfirmAction
        label={t("delete")}
        accessibleLabel={t("deleteItem", { name })}
        title={t("deleteTitle", { name })}
        description={deleteDescription}
        confirmLabel={t("confirmDelete")}
        pendingLabel={t("deleting")}
        cancelLabel={t("keep")}
        pending={deleting}
        size="sm"
        onConfirm={onDelete}
      />
    </div>
  );
}

export function I18nFields({
  id,
  label,
  es,
  en,
  maxLength,
}: {
  id: string;
  label: string;
  es: { registration: UseFormRegisterReturn; error?: string };
  en: { registration: UseFormRegisterReturn; error?: string };
  maxLength: number;
}) {
  const t = useTranslations("Admin");

  return (
    <div className="grid items-start gap-4 sm:grid-cols-2">
      <TextField id={`${id}-es`} label={t("inSpanish", { label })} maxLength={maxLength} {...es} />
      <TextField id={`${id}-en`} label={t("inEnglish", { label })} maxLength={maxLength} {...en} />
    </div>
  );
}
