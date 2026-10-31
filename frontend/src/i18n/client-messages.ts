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
export const CARD_NAMESPACES = ["Favorites"] as const;
export const SHOP_NAMESPACES = ["Listing", ...CARD_NAMESPACES] as const;
export const PURCHASE_NAMESPACES = ["Catalog", "Product", "Cart", "Validation", "Errors"] as const;
export const PRODUCT_NAMESPACES = [...PURCHASE_NAMESPACES, ...CARD_NAMESPACES, "Reviews"] as const;
export const CHECKOUT_NAMESPACES = [
  "Product",
  "Checkout",
  "AddressForm",
  "BillingForm",
  "Account",
  "Validation",
  "Errors",
] as const;
export const FAVORITES_NAMESPACES = [...CARD_NAMESPACES, "Catalog", "Pagination", "Errors"] as const;
export const REVIEWS_NAMESPACES = ["Reviews", "AccountReviews", "Validation", "Errors"] as const;
export const ADMIN_NAMESPACES = ["Admin", "Catalog", "NotFound", "Pagination", "Validation", "Errors"] as const;
export const ORDERS_NAMESPACES = [
  "Orders",
  "Pagination",
  "Checkout",
  "BillingForm",
  "Product",
  "Validation",
  "Errors",
] as const;
