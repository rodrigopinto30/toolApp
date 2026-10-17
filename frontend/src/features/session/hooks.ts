"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { api } from "@/lib/api/browser";
import { unwrap } from "@/lib/api/errors";
import type { components } from "@/lib/api/schema";

import { broadcastAuthEvent } from "./broadcast";
import { useSession } from "./session-provider";

type Schemas = components["schemas"];

export const sessionKeys = {
  me: ["me"] as const,
};

const ME_STALE_TIME_MS = 5 * 60_000;

export function useMe() {
  const { hasSession } = useSession();
  return useQuery({
    queryKey: sessionKeys.me,
    queryFn: () => unwrap(api.GET("/api/v1/me")),
    enabled: hasSession,
    staleTime: ME_STALE_TIME_MS,
    retry: false,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  const { setHasSession } = useSession();
  return useMutation({
    mutationFn: (body: Schemas["LoginRequest"]) => unwrap(api.POST("/api/v1/auth/login", { body })),
    onSuccess: (user) => {
      queryClient.setQueryData(sessionKeys.me, user);
      setHasSession(true);
      broadcastAuthEvent("login");
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const { setHasSession } = useSession();
  const router = useRouter();
  return useMutation({
    mutationFn: () => unwrap(api.POST("/api/v1/auth/logout")),
    onSettled: () => {
      queryClient.clear();
      setHasSession(false);
      broadcastAuthEvent("logout");
      router.refresh();
    },
  });
}

export function useRegister() {
  return useMutation({
    mutationFn: (body: Schemas["RegisterRequest"]) => unwrap(api.POST("/api/v1/auth/register", { body })),
  });
}

export function useVerifyEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Schemas["VerifyEmailRequest"]) =>
      unwrap(api.POST("/api/v1/auth/verify-email", { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionKeys.me }),
  });
}

export function useResendVerification() {
  return useMutation({
    mutationFn: (locale: Schemas["RegisterRequest"]["locale"]) =>
      unwrap(api.POST("/api/v1/auth/resend-verification", { params: { query: { locale } } })),
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (body: Schemas["ForgotPasswordRequest"]) =>
      unwrap(api.POST("/api/v1/auth/forgot-password", { body })),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (body: Schemas["ResetPasswordRequest"]) =>
      unwrap(api.POST("/api/v1/auth/reset-password", { body })),
  });
}
