import type { Locator } from "@playwright/test";

import type { Messages } from "../support/i18n";

export type CardNumber = "4242 4242 4242 4242" | "4000 0000 0000 0002" | "4000 0000 0009 0003";
export const APPROVED_CARD: CardNumber = "4242 4242 4242 4242";
export const REJECTED_CARD: CardNumber = "4000 0000 0000 0002";
export const SLOW_CARD: CardNumber = "4000 0000 0009 0003";

export async function fillCard(form: Locator, t: Messages, number: CardNumber): Promise<void> {
  const card = t.Checkout.payment;
  await form.getByLabel(card.number, { exact: true }).fill(number);
  await form.getByLabel(card.expiry, { exact: true }).fill("12/30");
  await form.getByLabel(card.cvc, { exact: true }).fill("123");
  await form.getByLabel(card.holder, { exact: true }).fill("Ana Prueba");
}
