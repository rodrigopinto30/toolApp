import type { components } from "@/lib/api/schema";

type Schemas = components["schemas"];

export type Order = Schemas["OrderRead"];
export type OrderSummary = Schemas["OrderSummary"];
export type OrderStatus = Schemas["OrderStatus"];
