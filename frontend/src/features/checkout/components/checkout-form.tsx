"use client";

import { useState } from "react";

import { useAddresses } from "@/features/account/hooks";
import type { PickupPoint } from "@/features/catalog/components/pickup-point-details";
import type { ProvinceOption } from "@/features/catalog/components/shipping-quote";
import { BillingSection } from "@/features/checkout/components/billing-section";
import { CheckoutSummary } from "@/features/checkout/components/checkout-summary";
import { CouponSection } from "@/features/checkout/components/coupon-section";
import { DeliverySection } from "@/features/checkout/components/delivery-section";
import { PaymentForm } from "@/features/checkout/components/payment-form";
import { useCheckoutPreview } from "@/features/checkout/hooks";
import { isCouponError } from "@/features/checkout/outcome";
import type { CheckoutPreviewRequest, DeliveryMethod } from "@/features/checkout/types";
import { useCurrency } from "@/lib/currency-context";

export function CheckoutForm({
  provinces,
  pickupPoints,
  onPlaced,
}: {
  provinces: ProvinceOption[];
  pickupPoints: PickupPoint[];
  onPlaced: () => void;
}) {
  const currency = useCurrency();
  const addresses = useAddresses();
  const [method, setMethod] = useState<DeliveryMethod>("shipping");
  const [chosenAddress, setChosenAddress] = useState<number | null>(null);
  const [chosenPickupPoint, setChosenPickupPoint] = useState<number | null>(null);
  const [billingProfileId, setBillingProfileId] = useState<number | null>(null);
  const [coupon, setCoupon] = useState<string | null>(null);
  const [couponError, setCouponError] = useState<unknown>(null);

  const addressId = chosenAddress ?? addresses.data?.[0]?.id ?? null;
  const pickupPointId = chosenPickupPoint ?? pickupPoints[0]?.id ?? null;
  const delivery =
    method === "shipping"
      ? addressId && { delivery_method: method, address_id: addressId }
      : pickupPointId && { delivery_method: method, pickup_point_id: pickupPointId };
  const base: CheckoutPreviewRequest | null = delivery
    ? { ...delivery, billing_profile_id: billingProfileId, currency }
    : null;
  const body = base && { ...base, coupon_code: coupon };
  const preview = useCheckoutPreview(body);
  const current = preview.data && !preview.isPlaceholderData && !preview.isFetching ? preview.data : undefined;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem] lg:items-start">
      <div className="grid gap-6">
        <DeliverySection
          method={method}
          onMethodChange={setMethod}
          addressId={addressId}
          onAddressChange={setChosenAddress}
          pickupPointId={pickupPointId}
          onPickupPointChange={setChosenPickupPoint}
          pickupPoints={pickupPoints}
          provinces={provinces}
        />
        <BillingSection profileId={billingProfileId} onProfileChange={setBillingProfileId} />
        <CouponSection
          base={base}
          coupon={coupon}
          error={couponError ?? (isCouponError(preview.error) ? preview.error : null)}
          onApplied={(code) => {
            setCoupon(code);
            setCouponError(null);
          }}
          onRemoved={() => {
            setCoupon(null);
            setCouponError(null);
          }}
        />
        <PaymentForm
          body={body}
          total={current?.total}
          onCouponFailed={(error) => {
            setCoupon(null);
            setCouponError(error);
          }}
          onPlaced={onPlaced}
        />
      </div>
      <CheckoutSummary
        preview={preview.data}
        error={isCouponError(preview.error) ? null : preview.error}
        isUpdating={preview.isFetching}
        hasDelivery={body !== null}
      />
    </div>
  );
}
