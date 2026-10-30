"use client";

import { useTranslations } from "next-intl";

import { AccountBook } from "@/features/account/components/account-book";
import { AddressForm, type Address } from "@/features/account/components/address-form";
import { addressLine } from "@/features/account/address-line";
import { useAddresses, useDeleteAddress, useSetDefaultAddress } from "@/features/account/hooks";
import type { ProvinceOption } from "@/features/catalog/components/shipping-quote";

function AddressDetails({ address }: { address: Address }) {
  return (
    <>
      <p>{address.recipient_name}</p>
      <p>{addressLine(address)}</p>
      <p>{address.phone}</p>
      {address.notes && <p>{address.notes}</p>}
    </>
  );
}

export function AddressBook({ provinces }: { provinces: ProvinceOption[] }) {
  const t = useTranslations("Account.addresses");
  const addresses = useAddresses();
  const remove = useDeleteAddress();
  const setDefault = useSetDefaultAddress();

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
      items={addresses}
      remove={remove}
      setDefault={setDefault}
      nameOf={(address) => address.label}
      details={(address) => <AddressDetails address={address} />}
      form={(address, close) => (
        <AddressForm
          key={address?.id ?? "new"}
          provinces={provinces}
          address={address}
          defaultValues={{ is_default: addresses.data?.length === 0 }}
          onSaved={close}
          onCancel={close}
        />
      )}
    />
  );
}
