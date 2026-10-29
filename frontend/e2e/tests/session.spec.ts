import type { BrowserContext } from "@playwright/test";

import { ACCESS_COOKIE } from "../../src/lib/session-cookies";
import { AccountPage } from "../pages/account-page";
import { redirectedToLogin } from "../pages/login-page";
import { expect, test } from "../support/fixtures";
import { messages } from "../support/i18n";

const t = messages.es;

async function invalidateAccessToken(context: BrowserContext): Promise<void> {
  const cookie = (await context.cookies()).find(({ name }) => name === ACCESS_COOKIE);
  if (!cookie) {
    throw new Error(`${ACCESS_COOKIE} is missing`);
  }
  await context.addCookies([{ ...cookie, value: "invalid" }]);
}

test("open tabs share one token refresh and the logout", async ({ context, account, loginPage, accountPage }) => {
  await loginPage.goto();
  await loginPage.login(account);
  await expect(accountPage.heading).toHaveText(t.Account.title);
  const tabs = [accountPage, new AccountPage(await context.newPage())];
  await tabs[1].goto();
  await expect(tabs[1].heading).toHaveText(t.Account.title);

  await test.step("an invalid access token is refreshed once for every tab", async () => {
    const refreshes: string[] = [];
    context.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/v1/auth/refresh") {
        refreshes.push(request.method());
      }
    });
    await invalidateAccessToken(context);
    await Promise.all(tabs.map((tab) => tab.page.reload()));
    for (const tab of tabs) {
      await expect(tab.heading).toHaveText(t.Account.title);
    }
    expect(refreshes).toEqual(["POST"]);
  });

  await test.step("the logout in one tab logs out the other", async () => {
    await tabs[1].logout.click();
    for (const tab of tabs) {
      await expect(tab.page).toHaveURL(redirectedToLogin(tab.url));
      await expect(tab.header.loginLink).toBeVisible();
    }
    expect((await context.cookies()).map(({ name }) => name)).not.toContain(ACCESS_COOKIE);
  });
});
