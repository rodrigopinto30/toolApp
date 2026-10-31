import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";

import { CSRF_COOKIE } from "@/lib/api/cookies";
import { ORIGIN } from "@/test/cart";
import { clearCookie, setCookie } from "@/test/cookies";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";

import { FavoriteButton } from "./favorite-button";

const push = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: jest.fn() }),
}));

const SLUG = "truper-hammer";
const FAVORITE = `${ORIGIN}/api/v1/me/favorites/${SLUG}`;
const SLUGS = `${ORIGIN}/api/v1/me/favorites/slugs`;

function serveSlugs(initial: string[]) {
  let slugs = initial;
  server.use(http.get(SLUGS, () => HttpResponse.json(slugs)));
  return (next: string[]) => {
    slugs = next;
  };
}

function held(): [Promise<void>, () => void] {
  let release = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return [promise, release];
}

function heart(pressed: boolean) {
  return screen.findByRole("button", { name: "Marcar Martillo como favorito", pressed });
}

beforeEach(() => {
  push.mockClear();
  setCookie(CSRF_COOKIE, "token");
});

afterEach(() => clearCookie(CSRF_COOKIE));

it("sends a guest to login and adds nothing", async () => {
  const requests: string[] = [];
  server.use(
    http.all(`${ORIGIN}/api/v1/me/favorites/*`, ({ request }) => {
      requests.push(request.url);
      return new HttpResponse(null, { status: 204 });
    }),
  );
  window.history.pushState({}, "", "/es/search?q=martillo");
  renderWithProviders(<FavoriteButton slug={SLUG} name="Martillo" />);

  await userEvent.setup().click(await heart(false));

  expect(push).toHaveBeenCalledWith("/es/login?next=%2Fes%2Fsearch%3Fq%3Dmartillo");
  expect(requests).toEqual([]);
});

it("waits for the customer's favorites and then shows the stored state", async () => {
  serveSlugs([SLUG]);
  renderWithProviders(<FavoriteButton slug={SLUG} name="Martillo" />, { hasSession: true });

  expect(screen.getByRole("button", { name: "Marcar Martillo como favorito" })).toBeDisabled();
  expect(await heart(true)).toBeEnabled();
});

it("fills the heart before the API answers", async () => {
  const setSlugs = serveSlugs([]);
  const [answer, release] = held();
  server.use(
    http.put(FAVORITE, async () => {
      await answer;
      setSlugs([SLUG]);
      return new HttpResponse(null, { status: 204 });
    }),
  );
  renderWithProviders(<FavoriteButton slug={SLUG} name="Martillo" />, { hasSession: true });

  await userEvent.setup().click(await heart(false));

  expect(await heart(true)).toBeInTheDocument();
  act(release);
  expect(await heart(true)).toBeInTheDocument();
});

it("rolls back when the API fails, without waiting for the refetch", async () => {
  serveSlugs([SLUG]);
  const [answer, failDelete] = held();
  const [refetch, finishRefetch] = held();
  server.use(
    http.delete(FAVORITE, async () => {
      await answer;
      server.use(
        http.get(SLUGS, async () => {
          await refetch;
          return HttpResponse.json([SLUG]);
        }),
      );
      return HttpResponse.json({ code: "internal_error" }, { status: 500 });
    }),
  );
  renderWithProviders(<FavoriteButton slug={SLUG} name="Martillo" />, { hasSession: true });

  await userEvent.setup().click(await heart(true));
  expect(await heart(false)).toBeInTheDocument();
  act(failDelete);

  expect(await heart(true)).toBeInTheDocument();
  act(finishRefetch);
});

it("sends a double click in order, so the last click wins", async () => {
  const setSlugs = serveSlugs([]);
  const calls: string[] = [];
  server.use(
    http.put(FAVORITE, async () => {
      calls.push("add started");
      await delay(50);
      setSlugs([SLUG]);
      calls.push("add finished");
      return new HttpResponse(null, { status: 204 });
    }),
    http.delete(FAVORITE, () => {
      calls.push("remove started");
      setSlugs([]);
      return new HttpResponse(null, { status: 204 });
    }),
  );
  renderWithProviders(<FavoriteButton slug={SLUG} name="Martillo" />, { hasSession: true });
  const user = userEvent.setup();

  await user.click(await heart(false));
  await user.click(await heart(true));

  await waitFor(() => expect(calls).toEqual(["add started", "add finished", "remove started"]));
  expect(await heart(false)).toBeInTheDocument();
});
