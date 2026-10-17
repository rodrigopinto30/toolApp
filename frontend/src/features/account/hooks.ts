"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { sessionKeys } from "@/features/session/hooks";
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
