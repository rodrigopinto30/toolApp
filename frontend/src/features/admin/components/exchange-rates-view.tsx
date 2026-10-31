"use client";
"use no memo";

import { zodResolver } from "@hookform/resolvers/zod";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useId } from "react";
import { useForm, useFormState } from "react-hook-form";

import { FormAlert } from "@/components/form/form-alert";
import { TextField } from "@/components/form/text-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, useAdminPage, type Column } from "@/features/admin/components/data-table";
import { FormActions, ResourceHeader } from "@/features/admin/components/resource-parts";
import { ResourceSheet, useResourceSheet } from "@/features/admin/components/resource-sheet";
import { useCreateExchangeRate, useExchangeRates } from "@/features/admin/hooks";
import { exchangeRateSchema, type ExchangeRateInput, type ExchangeRateValues } from "@/features/admin/schemas";
import type { AdminExchangeRate } from "@/features/admin/types";
import { useErrorMessage } from "@/features/errors/use-error-message";
import type { Locale } from "@/i18n/locales";
import { formatDecimal } from "@/lib/money";

const RATE_DIGITS = 6;

function ExchangeRateForm({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const t = useTranslations("Admin.exchangeRates");
  const tv = useTranslations("Validation");
  const id = useId();
  const errorMessage = useErrorMessage();
  const create = useCreateExchangeRate();
  const form = useForm<ExchangeRateValues, unknown, ExchangeRateInput>({
    resolver: zodResolver(exchangeRateSchema((key) => tv(key))),
    defaultValues: { rate: "" },
  });
  const { errors } = useFormState({ control: form.control });

  const onSubmit = form.handleSubmit((values) => create.mutate(values, { onSuccess: () => onSaved() }));

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormAlert message={create.error ? errorMessage(create.error) : undefined} />
      <TextField
        id={`${id}-rate`}
        label={t("rate")}
        hint={t("rateHint")}
        inputMode="decimal"
        error={errors.rate?.message}
        registration={form.register("rate")}
      />
      <FormActions pending={create.isPending} onCancel={onCancel} />
    </form>
  );
}

export function ExchangeRatesView() {
  const t = useTranslations("Admin.exchangeRates");
  const locale = useLocale() as Locale;
  const format = useFormatter();
  const page = useAdminPage();
  const rates = useExchangeRates(page);
  const sheet = useResourceSheet<AdminExchangeRate>();
  const currentId = page === 1 ? rates.data?.items[0]?.id : undefined;

  const columns: Column<AdminExchangeRate>[] = [
    {
      header: t("rate"),
      cell: (rate) => (
        <span className="flex items-center gap-2 font-medium">
          {formatDecimal(rate.rate, locale, RATE_DIGITS)}
          {rate.id === currentId && <Badge variant="secondary">{t("current")}</Badge>}
        </span>
      ),
    },
    {
      header: t("date"),
      cell: (rate) => format.dateTime(new Date(rate.created_at), { dateStyle: "short", timeStyle: "short" }),
    },
  ];

  return (
    <div className="grid gap-4">
      <ResourceHeader title={t("title")}>
        <Button onClick={sheet.add}>{t("add")}</Button>
      </ResourceHeader>
      <p className="text-sm text-muted-foreground">{t("description")}</p>
      <DataTable
        label={t("title")}
        columns={columns}
        rowKey={(rate) => rate.id}
        query={rates}
        emptyLabel={t("empty")}
      />
      <ResourceSheet open={sheet.open} title={t("addTitle")} onClose={sheet.close}>
        <ExchangeRateForm onSaved={sheet.close} onCancel={sheet.close} />
      </ResourceSheet>
    </div>
  );
}
