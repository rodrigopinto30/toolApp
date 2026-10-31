"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { catalogKeys } from "@/features/admin/catalog/hooks";
import { useAdminList, useAdminMutation } from "@/features/admin/hooks";
import { api } from "@/lib/api/browser";
import { ApiError, unwrap } from "@/lib/api/errors";
import type { components } from "@/lib/api/schema";

import type { OrderFilters, UserFilters } from "./types";

type Schemas = components["schemas"];

const PAGE_SIZE = 20;

export const operationKeys = {
  orders: ["admin", "orders"] as const,
  order: (number: string) => ["admin", "orders", number] as const,
  reviews: ["admin", "reviews"] as const,
  users: ["admin", "users"] as const,
};

export function useAdminOrders(page: number, filters: OrderFilters) {
  const query = { page, size: PAGE_SIZE, ...filters };
  return useAdminList(operationKeys.orders, query, () =>
    unwrap(api.GET("/api/v1/admin/orders", { params: { query } })),
  );
}

export function useAdminOrder(number: string) {
  return useQuery({
    queryKey: operationKeys.order(number),
    queryFn: () => unwrap(api.GET("/api/v1/admin/orders/{number}", { params: { path: { number } } })),
  });
}

export function useChangeOrderStatus(number: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Schemas["OrderStatusUpdate"]) =>
      unwrap(api.POST("/api/v1/admin/orders/{number}/status", { params: { path: { number } }, body })),
    onSuccess: async (order) => {
      await queryClient.invalidateQueries({ queryKey: operationKeys.orders, refetchType: "none" });
      queryClient.setQueryData(operationKeys.order(number), order);
      return queryClient.invalidateQueries({ queryKey: catalogKeys.products });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === "invalid_transition") {
        return queryClient.invalidateQueries({ queryKey: operationKeys.orders });
      }
      return undefined;
    },
  });
}

export function useAdminReviews(page: number, status: Schemas["ReviewStatus"] | undefined) {
  const query = { page, size: PAGE_SIZE, status };
  return useAdminList(operationKeys.reviews, query, () =>
    unwrap(api.GET("/api/v1/admin/reviews", { params: { query } })),
  );
}

export function useModerateReview() {
  return useAdminMutation(
    operationKeys.reviews,
    ({ id, approve }: { id: number; approve: boolean }) => {
      const params = { path: { review_id: id } };
      return approve
        ? unwrap(api.POST("/api/v1/admin/reviews/{review_id}/approve", { params }))
        : unwrap(api.POST("/api/v1/admin/reviews/{review_id}/reject", { params }));
    },
  );
}

export function useAdminUsers(page: number, filters: UserFilters) {
  const query = { page, size: PAGE_SIZE, ...filters };
  return useAdminList(operationKeys.users, query, () =>
    unwrap(api.GET("/api/v1/admin/users", { params: { query } })),
  );
}

export function useUpdateUser() {
  return useAdminMutation(operationKeys.users, ({ id, ...body }: Schemas["UserUpdate"] & { id: number }) =>
    unwrap(api.PATCH("/api/v1/admin/users/{user_id}", { params: { path: { user_id: id } }, body })),
  );
}
