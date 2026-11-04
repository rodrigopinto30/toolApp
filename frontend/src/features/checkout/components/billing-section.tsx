"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { RadioCard } from "@/components/form/radio-card";
import { Button } from "@/components/ui/button";
import { BillingProfileForm } from "@/features/account/components/billing-profile-form";
import { useBillingProfiles } from "@/features/account/hooks";
import { StepHeading } from "@/features/checkout/components/step-heading";

const FINAL_CONSUMER = "final-consumer";

export function BillingSection({
  profileId,
  onProfileChange,
}: {
  profileId: number | null;
  onProfileChange: (id: number | null) => void;
}) {
  const t = useTranslations("Checkout.billing");
  const tf = useTranslations("BillingForm");
  const headingId = useId();
  const profiles = useBillingProfiles();
  const [adding, setAdding] = useState(false);

  return (
    <section aria-labelledby={headingId} className="grid gap-4 rounded-xl border bg-card p-4 shadow-xs sm:p-5">
      <StepHeading id={headingId} step={2}>
        {t("title")}
      </StepHeading>
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">{t("profile")}</legend>
        <RadioCard
          name="billing-profile"
          value={FINAL_CONSUMER}
          checked={profileId === null}
          onChange={() => onProfileChange(null)}
          title={t("finalConsumer")}
        >
          {t("finalConsumerHint")}
        </RadioCard>
        {(profiles.data ?? []).map((profile) => (
          <RadioCard
            key={profile.id}
            name="billing-profile"
            value={profile.id}
            checked={profile.id === profileId}
            onChange={() => onProfileChange(profile.id)}
            title={profile.legal_name}
          >
            {`${profile.tax_id_type} ${profile.tax_id} · ${tf(`conditions.${profile.tax_condition}`)}`}
          </RadioCard>
        ))}
        {adding ? (
          <div className="rounded-lg border border-dashed p-4">
            <BillingProfileForm
              onSaved={(profile) => {
                onProfileChange(profile.id);
                setAdding(false);
              }}
              onCancel={() => setAdding(false)}
            />
          </div>
        ) : (
          <Button type="button" variant="outline" className="justify-self-start" onClick={() => setAdding(true)}>
            {t("addProfile")}
          </Button>
        )}
      </fieldset>
    </section>
  );
}
