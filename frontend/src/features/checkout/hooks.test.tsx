import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { NextIntlClientProvider } from "next-intl";

import { CSRF_COOKIE } from "@/lib/api/cookies";
import { makeQueryClient } from "@/lib/query-client";
import { ORIGIN } from "@/test/cart";
import { clearCookie, setCookie } from "@/test/cookies";
import { server } from "@/test/msw/server";

import { usePlaceOrder } from "./hooks";

const CARD = { card_number: "4242 4242 4242 4242", expiry: "12/30", cvc: "123", holder: "Ana Diaz" };
const BODY = {
  delivery_method: "pickup" as const,
  pickup_point_id: 1,
  currency: "ARS" as const,
  expected_total: { amount: "10150", currency: "ARS" as const },
};

beforeEach(() => setCookie(CSRF_COOKIE, "token"));
afterEach(() => clearCookie(CSRF_COOKIE));

it("sends the card to the API but never keeps it in the mutation cache", async () => {
  let sent: unknown;
  server.use(
    http.post(`${ORIGIN}/api/v1/checkout`, async ({ request }) => {
      sent = await request.json();
      return HttpResponse.json({ number: "TA-2026-000001" }, { status: 201 });
    }),
  );
  const queryClient = makeQueryClient();
  const { result } = renderHook(() => usePlaceOrder(() => CARD), {
    wrapper: ({ children }) => (
      <NextIntlClientProvider locale="es" messages={{}}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </NextIntlClientProvider>
    ),
  });

  act(() => result.current.mutate({ body: BODY, key: "key" }));

  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(sent).toMatchObject({ payment: CARD });
  expect(JSON.stringify(queryClient.getMutationCache().getAll().map((mutation) => mutation.state))).not.toContain("4242");
});
