"use client";
"use no memo";

import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId } from "react";
import { Controller, useForm, useFormState, useWatch } from "react-hook-form";

import { ChoiceChip } from "@/components/form/choice-chip";
import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { TextField } from "@/components/form/text-field";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useShippingQuote } from "@/features/catalog/hooks";
import {
  DELIVERY_METHODS,
  MAX_QUANTITY,
  shippingQuoteSchema,
  type ShippingQuoteValues,
} from "@/features/catalog/schemas";
import type { ShippingQuoteRequest, ShippingQuoteResult } from "@/features/catalog/types";
import { useSelectedVariant } from "@/features/catalog/use-selected-variant";
import type { Variant } from "@/features/catalog/variants";
import { useErrorMessage } from "@/features/errors/use-error-message";
import type { Currency } from "@/lib/currency";
import { formatMoney } from "@/lib/money";

const OPENING_DAYS = ["mon_fri", "sat", "sun"] as const;

export type ProvinceOption = { code: string; name: string };

function quoteRequest(values: ShippingQuoteValues, variantId: number, currency: Currency): ShippingQuoteRequest {
  return {
    delivery_method: values.method,
    province_code: values.method === "shipping" ? values.province : null,
    items: [{ variant_id: variantId, quantity: values.quantity }],
    currency,
  };
}

export function ShippingQuote({
  variants,
  provinces,
  currency,
}: {
  variants: Variant[];
  provinces: ProvinceOption[];
  currency: Currency;
}) {
  const t = useTranslations("Product.shipping");
  const tv = useTranslations("Validation");
  const id = useId();
  const errorMessage = useErrorMessage();
  const [variant] = useSelectedVariant(variants);
  const quote = useShippingQuote();
  const { mutate, variables } = quote;
  const form = useForm<ShippingQuoteValues>({
    resolver: zodResolver(shippingQuoteSchema((key) => tv(key))),
    defaultValues: { method: "shipping", province: "", quantity: 1 },
  });
  const { errors } = useFormState({ control: form.control });
  const method = useWatch({ control: form.control, name: "method" });
  const provinceId = `${id}-province`;
  const provinceErrorId = errors.province ? `${provinceId}-error` : undefined;

  useEffect(() => {
    if (variables && (variables.items[0].variant_id !== variant.id || variables.currency !== currency)) {
      mutate({ ...variables, items: [{ ...variables.items[0], variant_id: variant.id }], currency });
    }
  }, [variant.id, currency, variables, mutate]);

  const onSubmit = form.handleSubmit((values) => mutate(quoteRequest(values, variant.id, currency)));

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">{t("method")}</legend>
        <div className="flex flex-wrap gap-2">
          {DELIVERY_METHODS.map((option) => (
            <ChoiceChip key={option} value={option} label={t(`methods.${option}`)} {...form.register("method")} />
          ))}
        </div>
      </fieldset>
      {method === "shipping" && (
        <div className="grid gap-2">
          <Label htmlFor={provinceId}>{t("province")}</Label>
          <Controller
            control={form.control}
            name="province"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger
                  id={provinceId}
                  aria-invalid={errors.province ? true : undefined}
                  aria-describedby={provinceErrorId}
                  className="w-full"
                >
                  <SelectValue placeholder={t("provincePlaceholder")} />
                </SelectTrigger>
                <SelectContent position="popper">
                  {provinces.map((province) => (
                    <SelectItem key={province.code} value={province.code}>
                      {province.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.province && (
            <p id={provinceErrorId} className="text-sm text-destructive">
              {errors.province.message}
            </p>
          )}
        </div>
      )}
      <TextField
        id={`${id}-quantity`}
        type="number"
        inputMode="numeric"
        min={1}
        max={MAX_QUANTITY}
        className="w-24"
        label={t("quantity")}
        error={errors.quantity?.message}
        registration={form.register("quantity", { valueAsNumber: true })}
      />
      <SubmitButton pending={quote.isPending} pendingLabel={t("submitting")} variant="outline" className="justify-self-start">
        {t("submit")}
      </SubmitButton>
      <FormAlert message={quote.error ? errorMessage(quote.error) : undefined} />
      {quote.data && <QuoteResult quote={quote.data} />}
    </form>
  );
}

function QuoteResult({ quote }: { quote: ShippingQuoteResult }) {
  const t = useTranslations("Product.shipping");
  const locale = useLocale();
  const dayLabel = (day: string) => {
    const known = OPENING_DAYS.find((candidate) => candidate === day);
    return known ? t(`hours.${known}`) : day;
  };

  if (quote.delivery_method === "pickup") {
    return (
      <div role="status" className="grid gap-2 rounded-lg bg-muted/50 p-3 text-sm">
        <p className="font-medium">{t("pickup")}</p>
        <ul className="grid gap-2">
          {quote.pickup_points.map((point) => (
            <li key={point.id} className="grid gap-0.5">
              <p className="font-medium">{point.name}</p>
              <p className="text-muted-foreground">{point.address}</p>
              {Object.entries(point.hours ?? {}).map(([day, hours]) => (
                <p key={day} className="text-muted-foreground">
                  {dayLabel(day)}: {hours}
                </p>
              ))}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div role="status" className="grid gap-1 rounded-lg bg-muted/50 p-3 text-sm">
      <p className="font-medium">
        {quote.is_free ? t("free") : t("cost", { cost: formatMoney(quote.cost, locale) })}
      </p>
      <p className="text-muted-foreground">{t("eta", { min: quote.eta_min_days, max: quote.eta_max_days })}</p>
    </div>
  );
}
