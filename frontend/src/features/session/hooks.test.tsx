import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";

import { CSRF_COOKIE } from "@/lib/api/cookies";
import { makeQueryClient } from "@/lib/query-client";
import { clearCookie, setCookie } from "@/test/cookies";
import { server } from "@/test/msw/server";

import { useLogin, useLogout, useMe } from "./hooks";
import { SessionProvider, useSession } from "./session-provider";

const refresh = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const ORIGIN = "https://localhost";
const USER = {
  id: 1,
  email: "ana@example.com",
  first_name: "Ana",
  last_name: "Diaz",
  phone: null,
  role: "customer",
  email_verified: true,
  created_at: "2026-10-17T00:00:00Z",
};

function renderWithSession<T>(hook: () => T, hasSession: boolean) {
  const queryClient = makeQueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <SessionProvider initialHasSession={hasSession}>{children}</SessionProvider>
    </QueryClientProvider>
  );
  return { ...renderHook(hook, { wrapper }), queryClient };
}

beforeEach(() => {
  refresh.mockClear();
  localStorage.clear();
  setCookie(CSRF_COOKIE, "token");
});

afterEach(() => clearCookie(CSRF_COOKIE));

it("does not ask for /me without a session cookie", () => {
  const { result } = renderWithSession(() => useMe(), false);

  expect(result.current.fetchStatus).toBe("idle");
});

it("loads the user when there is a session", async () => {
  server.use(http.get(`${ORIGIN}/api/v1/me`, () => HttpResponse.json(USER)));

  const { result } = renderWithSession(() => useMe(), true);

  await waitFor(() => expect(result.current.data).toEqual(USER));
});

it("stores the user after logging in", async () => {
  server.use(http.post(`${ORIGIN}/api/v1/auth/login`, () => HttpResponse.json(USER)));
  const { result, queryClient } = renderWithSession(() => ({ login: useLogin(), session: useSession() }), false);

  await act(() => result.current.login.mutateAsync({ email: USER.email, password: "a-long-password" }));

  expect(result.current.session.hasSession).toBe(true);
  expect(queryClient.getQueryData(["me"])).toEqual(USER);
});

it("forgets the user and refreshes the page after logging out", async () => {
  let loggedOut = false;
  server.use(
    http.get(`${ORIGIN}/api/v1/me`, () => HttpResponse.json(USER)),
    http.post(`${ORIGIN}/api/v1/auth/logout`, () => {
      loggedOut = true;
      return new HttpResponse(null, { status: 204 });
    }),
  );
  const { result, queryClient } = renderWithSession(
    () => ({ me: useMe(), logout: useLogout(), session: useSession() }),
    true,
  );
  await waitFor(() => expect(result.current.me.data).toEqual(USER));

  await act(() => result.current.logout.mutateAsync());

  expect(loggedOut).toBe(true);
  expect(result.current.session.hasSession).toBe(false);
  expect(queryClient.getQueryData(["me"])).toBeUndefined();
  expect(refresh).toHaveBeenCalled();
});

it("ends the session when the refresh token is no longer valid", async () => {
  let loggedOut = false;
  server.use(
    http.get(`${ORIGIN}/api/v1/me`, () =>
      HttpResponse.json({ code: "token_expired", message: "x" }, { status: 401 }),
    ),
    http.post(`${ORIGIN}/api/v1/auth/refresh`, () =>
      HttpResponse.json({ code: "unauthorized", message: "x" }, { status: 401 }),
    ),
    http.post(`${ORIGIN}/api/v1/auth/logout`, () => {
      loggedOut = true;
      return new HttpResponse(null, { status: 204 });
    }),
  );

  const { result } = renderWithSession(() => ({ me: useMe(), session: useSession() }), true);

  await waitFor(() => expect(result.current.session.hasSession).toBe(false));
  await waitFor(() => expect(refresh).toHaveBeenCalled());
  expect(loggedOut).toBe(true);
  expect(result.current.me.data).toBeUndefined();
});
