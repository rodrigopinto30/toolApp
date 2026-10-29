"use client";

import { ShoppingCartIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";

import { QuantityStepper } from "@/components/form/quantity-stepper";
import { SubmitButton } from "@/components/form/submit-button";
import { useAddToCart } from "@/features/cart/hooks";
import { CART_PATH } from "@/features/cart/paths";
import { useSelectedVariant } from "@/features/catalog/use-selected-variant";
import type { Variant } from "@/features/catalog/variants";
import { useErrorMessage } from "@/features/errors/use-error-message";
import { Link } from "@/i18n/navigation";
import { MAX_LINE_QUANTITY } from "@/stores/guest-cart";

export function AddToCart({ variants }: { variants: Variant[] }) {
  const t = useTranslations("Cart");
  const errorMessage = useErrorMessage();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [variant] = useSelectedVariant(variants);
  const [quantity, setQuantity] = useState(1);
  const addToCart = useAddToCart();
  const outOfStock = variant.stock_status === "out_of_stock";
  const added = addToCart.isSuccess && addToCart.variables.variantId === variant.id;

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const typed = Number(input.current?.value);
    const units = Number.isInteger(typed) && typed >= 1 ? Math.min(typed, MAX_LINE_QUANTITY) : quantity;
    addToCart.mutate({ variantId: variant.id, quantity: units });
  };

  return (
    <form aria-label={t("add.label")} onSubmit={onSubmit} className="grid gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <QuantityStepper
          id={`${id}-quantity`}
          name="quantity"
          inputRef={input}
          label={t("quantity")}
          decreaseLabel={t("decrease")}
          increaseLabel={t("increase")}
          value={quantity}
          max={MAX_LINE_QUANTITY}
          disabled={outOfStock}
          onValueChange={setQuantity}
        />
        <SubmitButton pending={addToCart.isPending} pendingLabel={t("add.submitting")} disabled={outOfStock}>
          <ShoppingCartIcon aria-hidden="true" />
          {t("add.submit")}
        </SubmitButton>
      </div>
      <div aria-live="polite" className="text-sm">
        {outOfStock && <p className="text-muted-foreground">{t("add.outOfStock")}</p>}
        {added && (
          <p>
            {t("add.added")}{" "}
            <Link href={CART_PATH} className="underline underline-offset-4">
              {t("add.view")}
            </Link>
          </p>
        )}
        {addToCart.error && <p className="text-destructive">{errorMessage(addToCart.error)}</p>}
      </div>
    </form>
  );
}
