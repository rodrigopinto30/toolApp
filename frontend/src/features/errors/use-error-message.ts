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
      case "cart_limit":
      case "not_found":
        return t(error.code);
      case "insufficient_stock": {
        const available = availableUnits(error.details);
        return available === undefined ? t("insufficient_stock_unknown") : t("insufficient_stock", { available });
      }
      default:
        return error.requestId ? t("unexpectedWithId", { requestId: error.requestId }) : t("unexpected");
    }
  };
}

function availableUnits(details: unknown): number | undefined {
  if (typeof details !== "object" || details === null || !("available" in details)) {
    return undefined;
  }
  return typeof details.available === "number" ? details.available : undefined;
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
