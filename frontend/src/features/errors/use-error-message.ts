"use client";

import { useTranslations } from "next-intl";

import { ApiError } from "@/lib/api/errors";

export function useErrorMessage() {
  const t = useTranslations("Errors");

  return (error: unknown): string => {
    if (!(error instanceof ApiError)) {
      return t("unexpected");
    }
    const minutes = Math.max(1, Math.ceil((error.retryAfter ?? 60) / 60));
    switch (error.code) {
      case "invalid_credentials":
      case "account_disabled":
      case "invalid_token":
      case "invalid_current_password":
      case "csrf_failed":
      case "network_error":
      case "timeout":
      case "validation_error":
        return t(error.code);
      case "account_locked":
      case "rate_limited":
        return t(error.code, { minutes });
      case "service_unavailable":
      case "auth_unavailable":
        return t("service_unavailable");
      default:
        return error.requestId ? t("unexpectedWithId", { requestId: error.requestId }) : t("unexpected");
    }
  };
}

export function invalidFields(error: unknown): string[] {
  if (!(error instanceof ApiError) || error.code !== "validation_error" || !Array.isArray(error.details)) {
    return [];
  }
  return error.details.flatMap((detail: unknown) => {
    if (typeof detail !== "object" || detail === null || !("loc" in detail) || !Array.isArray(detail.loc)) {
      return [];
    }
    const [source, field] = detail.loc;
    return source === "body" && typeof field === "string" ? [field] : [];
  });
}
