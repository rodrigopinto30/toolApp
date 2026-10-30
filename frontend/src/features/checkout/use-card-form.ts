"use client";
"use no memo";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";

import { cardSchema, type CardValues } from "./schemas";

export function useCardForm() {
  const tv = useTranslations("Validation");
  return useForm<CardValues>({
    resolver: zodResolver(cardSchema((key) => tv(key))),
    defaultValues: { card_number: "", expiry: "", cvc: "", holder: "" },
  });
}
