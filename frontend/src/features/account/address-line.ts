import type { components } from "@/lib/api/schema";

type AddressFields = Pick<
  components["schemas"]["OrderAddress"],
  "street" | "number" | "floor_apt" | "city" | "province" | "postal_code"
>;

export function addressLine(address: AddressFields): string {
  const floor = address.floor_apt ? `, ${address.floor_apt}` : "";
  return `${address.street} ${address.number}${floor}, ${address.city}, ${address.province.name} (${address.postal_code})`;
}
