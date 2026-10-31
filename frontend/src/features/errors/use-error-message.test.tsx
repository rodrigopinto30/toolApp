import { renderHook } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import { ApiError } from "@/lib/api/errors";

import messages from "../../../messages/es.json";

import { invalidFields, useErrorMessage } from "./use-error-message";

function errorMessage() {
  const { result } = renderHook(() => useErrorMessage(), {
    wrapper: ({ children }) => (
      <NextIntlClientProvider locale="es" messages={messages}>
        {children}
      </NextIntlClientProvider>
    ),
  });
  return result.current;
}

function apiError(code: string, extra: Partial<ConstructorParameters<typeof ApiError>[0]> = {}) {
  return new ApiError({ status: 400, code, message: "backend text", ...extra });
}

it("reports the stock of an adjustment like the units left at checkout", () => {
  const message = errorMessage();

  expect(message(apiError("insufficient_stock", { details: { stock: 4 } }))).toBe(
    message(apiError("insufficient_stock", { details: { available: 4 } })),
  );
  expect(message(apiError("insufficient_stock", { details: { stock: 0 } }))).toContain("0");
});

it("translates known error codes", () => {
  const message = errorMessage();

  expect(message(apiError("invalid_credentials"))).toBe("Email o contraseña incorrectos.");
  expect(message(apiError("auth_unavailable"))).toBe(message(apiError("service_unavailable")));
});

it("tells how long to wait when rate limited", () => {
  const message = errorMessage();

  expect(message(apiError("account_locked", { retryAfter: 840 }))).toBe(
    "Demasiados intentos fallidos. Probá de nuevo en 14 minutos.",
  );
  expect(message(apiError("rate_limited", { retryAfter: 5 }))).toBe(
    "Demasiados intentos. Probá de nuevo en 1 minuto.",
  );
});

it("never shows backend text for unknown errors, only the request id", () => {
  const message = errorMessage();

  expect(message(apiError("something_new", { requestId: "abc123" }))).toBe(
    "Ocurrió un error inesperado (código abc123).",
  );
  expect(message(new Error("boom"))).toBe("Ocurrió un error inesperado.");
});

it("lists the body fields of a validation error", () => {
  const error = apiError("validation_error", {
    details: [{ loc: ["body", "email"] }, { loc: ["query", "locale"] }, { loc: ["body"] }, "x"],
  });

  expect(invalidFields(error)).toEqual(["email"]);
  expect(invalidFields(apiError("invalid_credentials"))).toEqual([]);
});
