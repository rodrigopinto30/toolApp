"use client";
"use no memo";

import { useTranslations } from "next-intl";
import { useFormState, type UseFormReturn } from "react-hook-form";

import { TextField } from "@/components/form/text-field";
import { formatCardNumber, formatExpiry } from "@/features/checkout/card";
import type { CardValues } from "@/features/checkout/schemas";

const TEST_CARDS = [
  { number: "4242 4242 4242 4242", result: "approved" },
  { number: "4000 0000 0000 0002", result: "rejected" },
  { number: "4000 0000 0009 0003", result: "slow" },
] as const;

export function cardPayment(values: CardValues) {
  return { card_number: values.card_number, expiry: values.expiry, cvc: values.cvc, holder: values.holder };
}

export function clearCard(form: UseFormReturn<CardValues>): void {
  form.resetField("card_number");
  form.resetField("expiry");
  form.resetField("cvc");
}

export function CardFields({ form, idPrefix }: { form: UseFormReturn<CardValues>; idPrefix: string }) {
  const t = useTranslations("Checkout.payment");
  const { errors } = useFormState({ control: form.control });

  return (
    <div className="grid gap-4">
      <div className="rounded-lg bg-muted/50 p-3 text-sm">
        <p>{t("testCards")}</p>
        <ul className="mt-2 grid gap-1">
          {TEST_CARDS.map((card) => (
            <li key={card.number}>
              <span className="font-mono tabular-nums">{card.number}</span>: {t(`cards.${card.result}`)}
            </li>
          ))}
        </ul>
      </div>
      <TextField
        id={`${idPrefix}-card_number`}
        label={t("number")}
        inputMode="numeric"
        autoComplete="cc-number"
        error={errors.card_number?.message}
        registration={form.register("card_number", {
          onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
            form.setValue("card_number", formatCardNumber(event.target.value)),
        })}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id={`${idPrefix}-expiry`}
          label={t("expiry")}
          inputMode="numeric"
          autoComplete="cc-exp"
          error={errors.expiry?.message}
          registration={form.register("expiry", {
            onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
              form.setValue("expiry", formatExpiry(event.target.value)),
          })}
        />
        <TextField
          id={`${idPrefix}-cvc`}
          label={t("cvc")}
          inputMode="numeric"
          autoComplete="cc-csc"
          maxLength={4}
          error={errors.cvc?.message}
          registration={form.register("cvc")}
        />
      </div>
      <TextField
        id={`${idPrefix}-holder`}
        label={t("holder")}
        autoComplete="cc-name"
        error={errors.holder?.message}
        registration={form.register("holder")}
      />
    </div>
  );
}
