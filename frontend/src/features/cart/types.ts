import type { components } from "@/lib/api/schema";

type Schemas = components["schemas"];

export type Cart = Schemas["CartRead"];
export type CartLine = Schemas["CartLine"];
export type CartLineIssue = Schemas["CartLineIssue"];
export type LineItem = Schemas["LineItem"];
