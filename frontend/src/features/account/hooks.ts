"use client";

import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";

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

function useBookMutation<Variables, Result>(
  queryKey: QueryKey,
  mutationFn: (variables: Variables) => Promise<Result>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });
}

function withoutUnsetDefault<Body extends { is_default?: boolean }>({ is_default, ...body }: Body) {
  return is_default ? { ...body, is_default: true as const } : body;
}

export function useAddresses() {
  const { hasSession } = useSession();
  return useQuery({
    queryKey: accountKeys.addresses,
    queryFn: () => unwrap(api.GET("/api/v1/me/addresses")),
    enabled: hasSession,
  });
}

export function useSaveAddress(id?: number) {
  return useBookMutation(accountKeys.addresses, (body: Schemas["AddressCreate"]) =>
    id === undefined
      ? unwrap(api.POST("/api/v1/me/addresses", { body }))
      : unwrap(
          api.PATCH("/api/v1/me/addresses/{address_id}", {
            params: { path: { address_id: id } },
            body: withoutUnsetDefault(body),
          }),
        ),
  );
}

export function useSetDefaultAddress() {
  return useBookMutation(accountKeys.addresses, (id: number) =>
    unwrap(
      api.PATCH("/api/v1/me/addresses/{address_id}", {
        params: { path: { address_id: id } },
        body: { is_default: true },
      }),
    ),
  );
}

export function useDeleteAddress() {
  return useBookMutation(accountKeys.addresses, (id: number) =>
    unwrap(api.DELETE("/api/v1/me/addresses/{address_id}", { params: { path: { address_id: id } } })),
  );
}

export function useBillingProfiles() {
  const { hasSession } = useSession();
  return useQuery({
    queryKey: accountKeys.billingProfiles,
    queryFn: () => unwrap(api.GET("/api/v1/me/billing-profiles")),
    enabled: hasSession,
  });
}

export function useSaveBillingProfile(id?: number) {
  return useBookMutation(accountKeys.billingProfiles, (body: Schemas["BillingProfileCreate"]) =>
    id === undefined
      ? unwrap(api.POST("/api/v1/me/billing-profiles", { body }))
      : unwrap(
          api.PATCH("/api/v1/me/billing-profiles/{profile_id}", {
            params: { path: { profile_id: id } },
            body: withoutUnsetDefault(body),
          }),
        ),
  );
}

export function useSetDefaultBillingProfile() {
  return useBookMutation(accountKeys.billingProfiles, (id: number) =>
    unwrap(
      api.PATCH("/api/v1/me/billing-profiles/{profile_id}", {
        params: { path: { profile_id: id } },
        body: { is_default: true },
      }),
    ),
  );
}

export function useDeleteBillingProfile() {
  return useBookMutation(accountKeys.billingProfiles, (id: number) =>
    unwrap(api.DELETE("/api/v1/me/billing-profiles/{profile_id}", { params: { path: { profile_id: id } } })),
  );
}
