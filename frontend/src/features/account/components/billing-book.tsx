"use client";

import { useTranslations } from "next-intl";

import { AccountBook } from "@/features/account/components/account-book";
import { BillingProfileForm, type BillingProfile } from "@/features/account/components/billing-profile-form";
import { useBillingProfiles, useDeleteBillingProfile, useSetDefaultBillingProfile } from "@/features/account/hooks";

function BillingDetails({ profile }: { profile: BillingProfile }) {
  const t = useTranslations("BillingForm");
  return (
    <>
      <p>
        {profile.tax_id_type} {profile.tax_id}
      </p>
      <p>{t(`conditions.${profile.tax_condition}`)}</p>
      <p>{profile.fiscal_address}</p>
    </>
  );
}

export function BillingBook() {
  const t = useTranslations("Account.billing");
  const profiles = useBillingProfiles();
  const remove = useDeleteBillingProfile();
  const setDefault = useSetDefaultBillingProfile();

  return (
    <AccountBook
      labels={{
        title: t("title"),
        add: t("add"),
        addTitle: t("addTitle"),
        editTitle: t("editTitle"),
        empty: t("empty"),
        loading: t("loading"),
        deleteTitle: (name) => t("deleteTitle", { name }),
        deleteDescription: t("deleteDescription"),
      }}
      items={profiles}
      remove={remove}
      setDefault={setDefault}
      nameOf={(profile) => profile.legal_name}
      details={(profile) => <BillingDetails profile={profile} />}
      form={(profile, close) => (
        <BillingProfileForm
          key={profile?.id ?? "new"}
          profile={profile}
          defaultValues={{ is_default: profiles.data?.length === 0 }}
          onSaved={close}
          onCancel={close}
        />
      )}
    />
  );
}
