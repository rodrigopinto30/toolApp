"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";

import { api } from "@/lib/api/browser";
import { unwrap } from "@/lib/api/errors";
import type { components } from "@/lib/api/schema";

import type { AuditFilters } from "./types";

type Schemas = components["schemas"];

const PAGE_SIZE = 20;
const WHOLE_LIST_SIZE = 100;

export const adminKeys = {
  coupons: ["admin", "coupons"] as const,
  exchangeRates: ["admin", "exchange-rates"] as const,
  zones: ["admin", "zones"] as const,
  provinces: ["admin", "provinces"] as const,
  pickupPoints: ["admin", "pickup-points"] as const,
  audit: ["admin", "audit"] as const,
};

export function useAdminList<Data>(key: QueryKey, params: object, load: () => Promise<Data>) {
  return useQuery({ queryKey: [...key, params], queryFn: load, placeholderData: keepPreviousData });
}

export function useAdminMutation<Variables, Result>(
  key: QueryKey,
  mutationFn: (variables: Variables) => Promise<Result>,
) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn, onSuccess: () => queryClient.invalidateQueries({ queryKey: key }) });
}

export function useCoupons(page: number) {
  const query = { page, size: PAGE_SIZE };
  return useAdminList(adminKeys.coupons, query, () =>
    unwrap(api.GET("/api/v1/admin/coupons", { params: { query } })),
  );
}

export function useSaveCoupon(id?: number) {
  return useAdminMutation(adminKeys.coupons, (body: Schemas["CouponCreate"]) =>
    id === undefined
      ? unwrap(api.POST("/api/v1/admin/coupons", { body }))
      : unwrap(api.PATCH("/api/v1/admin/coupons/{coupon_id}", { params: { path: { coupon_id: id } }, body })),
  );
}

export function useDeleteCoupon() {
  return useAdminMutation(adminKeys.coupons, (id: number) =>
    unwrap(api.DELETE("/api/v1/admin/coupons/{coupon_id}", { params: { path: { coupon_id: id } } })),
  );
}

export function useExchangeRates(page: number) {
  const query = { page, size: PAGE_SIZE };
  return useAdminList(adminKeys.exchangeRates, query, () =>
    unwrap(api.GET("/api/v1/admin/exchange-rates", { params: { query } })),
  );
}

export function useCreateExchangeRate() {
  return useAdminMutation(adminKeys.exchangeRates, (body: Schemas["ExchangeRateCreate"]) =>
    unwrap(api.POST("/api/v1/admin/exchange-rates", { body })),
  );
}

export function useZones() {
  const query = { size: WHOLE_LIST_SIZE };
  return useAdminList(adminKeys.zones, query, () => unwrap(api.GET("/api/v1/admin/zones", { params: { query } })));
}

export function useSaveZone(id?: number) {
  return useAdminMutation(adminKeys.zones, (body: Schemas["ZoneCreate"]) =>
    id === undefined
      ? unwrap(api.POST("/api/v1/admin/zones", { body }))
      : unwrap(api.PATCH("/api/v1/admin/zones/{zone_id}", { params: { path: { zone_id: id } }, body })),
  );
}

export function useDeleteZone() {
  return useAdminMutation(adminKeys.zones, (id: number) =>
    unwrap(api.DELETE("/api/v1/admin/zones/{zone_id}", { params: { path: { zone_id: id } } })),
  );
}

export function useProvinces() {
  const query = { size: WHOLE_LIST_SIZE };
  return useAdminList(adminKeys.provinces, query, () =>
    unwrap(api.GET("/api/v1/admin/provinces", { params: { query } })),
  );
}

export function useMoveProvince() {
  return useAdminMutation(adminKeys.provinces, ({ code, zoneId }: { code: string; zoneId: number }) =>
    unwrap(
      api.PATCH("/api/v1/admin/provinces/{code}", {
        params: { path: { code } },
        body: { shipping_zone_id: zoneId },
      }),
    ),
  );
}

export function usePickupPoints(page: number) {
  const query = { page, size: PAGE_SIZE };
  return useAdminList(adminKeys.pickupPoints, query, () =>
    unwrap(api.GET("/api/v1/admin/pickup-points", { params: { query } })),
  );
}

export function useSavePickupPoint(id?: number) {
  return useAdminMutation(adminKeys.pickupPoints, (body: Schemas["PickupPointCreate"]) =>
    id === undefined
      ? unwrap(api.POST("/api/v1/admin/pickup-points", { body }))
      : unwrap(api.PATCH("/api/v1/admin/pickup-points/{point_id}", { params: { path: { point_id: id } }, body })),
  );
}

export function useDeletePickupPoint() {
  return useAdminMutation(adminKeys.pickupPoints, (id: number) =>
    unwrap(api.DELETE("/api/v1/admin/pickup-points/{point_id}", { params: { path: { point_id: id } } })),
  );
}

export function useAuditLogs(page: number, filters: AuditFilters) {
  const query = { page, size: PAGE_SIZE, ...filters };
  return useAdminList(adminKeys.audit, query, () =>
    unwrap(api.GET("/api/v1/admin/audit-logs", { params: { query } })),
  );
}
