"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { ChoiceChip } from "@/components/form/choice-chip";
import { RadioCard } from "@/components/form/radio-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { addressLine } from "@/features/account/address-line";
import { AddressForm } from "@/features/account/components/address-form";
import { useAddresses } from "@/features/account/hooks";
import { PickupPointDetails, type PickupPoint } from "@/features/catalog/components/pickup-point-details";
import type { ProvinceOption } from "@/features/catalog/components/shipping-quote";
import type { DeliveryMethod } from "@/features/checkout/types";

const METHODS = ["shipping", "pickup"] as const satisfies readonly DeliveryMethod[];

export function DeliverySection({
  method,
  onMethodChange,
  addressId,
  onAddressChange,
  pickupPointId,
  onPickupPointChange,
  pickupPoints,
  provinces,
}: {
  method: DeliveryMethod;
  onMethodChange: (method: DeliveryMethod) => void;
  addressId: number | null;
  onAddressChange: (id: number) => void;
  pickupPointId: number | null;
  onPickupPointChange: (id: number) => void;
  pickupPoints: PickupPoint[];
  provinces: ProvinceOption[];
}) {
  const t = useTranslations("Checkout.delivery");
  const headingId = useId();
  const addresses = useAddresses();
  const [adding, setAdding] = useState(false);
  const saved = addresses.data ?? [];
  const showForm = adding || (addresses.isSuccess && saved.length === 0);

  return (
    <section aria-labelledby={headingId} className="grid gap-4 rounded-lg border p-4">
      <h2 id={headingId} className="text-lg font-semibold">
        {t("title")}
      </h2>
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">{t("method")}</legend>
        <div className="flex flex-wrap gap-2">
          {METHODS.map((option) => (
            <ChoiceChip
              key={option}
              name="delivery-method"
              value={option}
              label={t(`methods.${option}`)}
              checked={method === option}
              onChange={() => onMethodChange(option)}
            />
          ))}
        </div>
      </fieldset>
      {method === "shipping" ? (
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-medium">{t("address")}</legend>
          {addresses.isPending ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            saved.map((address) => (
              <RadioCard
                key={address.id}
                name="address"
                value={address.id}
                checked={address.id === addressId}
                onChange={() => onAddressChange(address.id)}
                title={address.label}
              >
                {addressLine(address)}
              </RadioCard>
            ))
          )}
          {showForm ? (
            <div className="rounded-lg border border-dashed p-4">
              <AddressForm
                provinces={provinces}
                defaultValues={{ is_default: saved.length === 0 }}
                onSaved={(address) => {
                  onAddressChange(address.id);
                  setAdding(false);
                }}
                onCancel={saved.length > 0 ? () => setAdding(false) : undefined}
              />
            </div>
          ) : (
            <Button type="button" variant="outline" className="justify-self-start" onClick={() => setAdding(true)}>
              {t("addAddress")}
            </Button>
          )}
        </fieldset>
      ) : (
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-medium">{t("pickupPoint")}</legend>
          {pickupPoints.length === 0 && <p className="text-sm text-muted-foreground">{t("noPickupPoints")}</p>}
          {pickupPoints.map((point) => (
            <RadioCard
              key={point.id}
              name="pickup-point"
              value={point.id}
              checked={point.id === pickupPointId}
              onChange={() => onPickupPointChange(point.id)}
              title={point.name}
            >
              <PickupPointDetails point={point} showName={false} />
            </RadioCard>
          ))}
        </fieldset>
      )}
    </section>
  );
}
