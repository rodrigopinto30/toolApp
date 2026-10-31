import type { components } from "@/lib/api/schema";

type Schemas = components["schemas"];

export type AdminOrder = Schemas["AdminOrderRead"];
export type AdminOrderSummary = Schemas["AdminOrderSummary"];
export type AdminReview = Schemas["AdminReviewRead"];
export type AdminUser = Schemas["AdminUserRead"];
export type OrderFilters = {
  status?: Schemas["OrderStatus"];
  number?: string;
  email?: string;
  date_from?: string;
  date_to?: string;
};
export type UserFilters = { q?: string; role?: Schemas["UserRole"]; is_active?: boolean };
