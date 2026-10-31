import type { components } from "@/lib/api/schema";

type Schemas = components["schemas"];

export type AdminCoupon = Schemas["AdminCouponRead"];
export type AdminExchangeRate = Schemas["AdminExchangeRateRead"];
export type AdminZone = Schemas["AdminZoneRead"];
export type AdminProvince = Schemas["AdminProvinceRead"];
export type AdminPickupPoint = Schemas["AdminPickupPointRead"];
export type AuditLog = Schemas["AuditLogRead"];
export type AuditFilters = { entity?: string; entity_id?: string; action?: string; date_from?: string; date_to?: string };
export type PageOf<Row> = { items: Row[]; page: number; size: number; total: number; pages: number };
