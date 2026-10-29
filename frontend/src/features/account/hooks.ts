"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { sessionKeys } from "@/features/session/hooks";
import { useSession } from "@/features/session/session-provider";
import { api } from "@/lib/api/browser";
import { unwrap } from "@/lib/api/errors";
import type { components } from "@/lib/api/schema";

type Schemas = components["schemas"];

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Schemas["MeUpdate"]) => unwrap(api.PATCH("/api/v1/me", { body })),
    onSuccess: (user) => queryClient.setQueryData(sessionKeys.me, user),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (body: Schemas["PasswordChange"]) => unwrap(api.POST("/api/v1/me/password", { body })),
  });
}

export const accountKeys = {
  addresses: ["me", "addresses"] as const,
  billingProfiles: ["me", "billing-profiles"] as const,
};

export function useAddresses() {
  const { hasSession } = useSession();
  return useQuery({
    queryKey: accountKeys.addresses,
    queryFn: () => unwrap(api.GET("/api/v1/me/addresses")),
    enabled: hasSession,
  });
}

export function useCreateAddress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Schemas["AddressCreate"]) => unwrap(api.POST("/api/v1/me/addresses", { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accountKeys.addresses }),
  });
}

export function useBillingProfiles() {
  const { hasSession } = useSession();
  return useQuery({
    queryKey: accountKeys.billingProfiles,
    queryFn: () => unwrap(api.GET("/api/v1/me/billing-profiles")),
    enabled: hasSession,
  });
}

export function useCreateBillingProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Schemas["BillingProfileCreate"]) =>
      unwrap(api.POST("/api/v1/me/billing-profiles", { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accountKeys.billingProfiles }),
  });
}
