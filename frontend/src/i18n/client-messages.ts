import type { AbstractIntlMessages } from "next-intl";
import { getMessages } from "next-intl/server";

export async function clientMessages(namespaces: readonly string[]): Promise<AbstractIntlMessages> {
  const messages = await getMessages();
  return Object.fromEntries(namespaces.map((namespace) => [namespace, messages[namespace as keyof typeof messages]]));
}

export const LAYOUT_NAMESPACES = [
  "LocaleSwitcher",
  "CurrencySwitcher",
  "UserMenu",
  "CartLink",
  "CategoryMenu",
  "SearchBox",
  "Error",
] as const;
export const FORM_NAMESPACES = [...LAYOUT_NAMESPACES, "Validation", "Errors"] as const;
export const SHOP_NAMESPACES = ["Listing"] as const;
export const PRODUCT_NAMESPACES = ["Catalog", "Product", "Cart", "Validation", "Errors"] as const;
export const PURCHASE_NAMESPACES = PRODUCT_NAMESPACES;
export const CHECKOUT_NAMESPACES = [
  "Product",
  "Checkout",
  "AddressForm",
  "BillingForm",
  "Account",
  "Validation",
  "Errors",
] as const;
export const ORDERS_NAMESPACES = [
  "Orders",
  "Pagination",
  "Checkout",
  "BillingForm",
  "Product",
  "Validation",
  "Errors",
] as const;
