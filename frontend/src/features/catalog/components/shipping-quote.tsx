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
import { SelectField } from "@/components/form/select-field";
import type { LineItem } from "@/features/cart/types";
import { PickupPointDetails } from "@/features/catalog/components/pickup-point-details";
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
import { useCurrency } from "@/lib/currency-context";
import { formatMoney } from "@/lib/money";

export type ProvinceOption = { code: string; name: string };
export type QuoteItems = (quantity: number) => LineItem[];

function quoteRequest(values: ShippingQuoteValues, items: LineItem[], currency: Currency): ShippingQuoteRequest {
  return {
    delivery_method: values.method,
    province_code: values.method === "shipping" ? values.province : null,
    items,
    currency,
  };
}

function sameItems(a: LineItem[], b: LineItem[]): boolean {
  return (
    a.length === b.length &&
    a.every((item, index) => item.variant_id === b[index].variant_id && item.quantity === b[index].quantity)
  );
}

export function ProductShippingQuote({ variants, provinces }: { variants: Variant[]; provinces: ProvinceOption[] }) {
  const [variant] = useSelectedVariant(variants);
  const items = (quantity: number) => [{ variant_id: variant.id, quantity }];
  return <ShippingQuote items={items} provinces={provinces} withQuantity />;
}

export function ShippingQuote({
  items,
  provinces,
  withQuantity = false,
}: {
  items: QuoteItems;
  provinces: ProvinceOption[];
  withQuantity?: boolean;
}) {
  const t = useTranslations("Product.shipping");
  const tv = useTranslations("Validation");
  const id = useId();
  const currency = useCurrency();
  const errorMessage = useErrorMessage();
  const quote = useShippingQuote();
  const { mutate, variables } = quote;
  const form = useForm<ShippingQuoteValues>({
    resolver: zodResolver(shippingQuoteSchema((key) => tv(key))),
    defaultValues: { method: "shipping", province: "", quantity: 1 },
  });
  const { errors } = useFormState({ control: form.control });
  const method = useWatch({ control: form.control, name: "method" });

  useEffect(() => {
    if (!variables) {
      return;
    }
    const next = items(variables.items[0]?.quantity ?? 1);
    if (variables.currency !== currency || !sameItems(variables.items, next)) {
      mutate({ ...variables, items: next, currency });
    }
  }, [items, currency, variables, mutate]);

  const onSubmit = form.handleSubmit((values) => mutate(quoteRequest(values, items(values.quantity), currency)));

  return (
    <form aria-label={t("title")} onSubmit={onSubmit} noValidate className="grid gap-4">
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">{t("method")}</legend>
        <div className="flex flex-wrap gap-2">
          {DELIVERY_METHODS.map((option) => (
            <ChoiceChip key={option} value={option} label={t(`methods.${option}`)} {...form.register("method")} />
          ))}
        </div>
      </fieldset>
      {method === "shipping" && (
        <Controller
          control={form.control}
          name="province"
          render={({ field }) => (
            <SelectField
              id={`${id}-province`}
              label={t("province")}
              placeholder={t("provincePlaceholder")}
              options={provinces.map(({ code, name }) => ({ value: code, label: name }))}
              value={field.value}
              error={errors.province?.message}
              onChange={field.onChange}
            />
          )}
        />
      )}
      {withQuantity && (
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
      )}
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

  if (quote.delivery_method === "pickup") {
    return (
      <div role="status" className="grid gap-2 rounded-lg bg-muted/50 p-3 text-sm">
        <p className="font-medium">{t("pickup")}</p>
        <ul className="grid gap-2">
          {quote.pickup_points.map((point) => (
            <li key={point.id}>
              <PickupPointDetails point={point} />
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
