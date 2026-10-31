import { buildCsp } from "../../src/lib/csp";
import { CURRENCY_COOKIE, DEFAULT_CURRENCY } from "../../src/lib/currency";
import { AUTH_PATHS, PROTECTED_PATHS } from "../../src/lib/routes";
import { redirectedToLogin } from "../pages/login-page";
import { expect, test } from "../support/fixtures";
import { messages, type Locale } from "../support/i18n";
import { BASE_URL, HTTP_URL, isDevStack } from "../support/stack";

const LOCALES = Object.keys(messages) as Locale[];

test.describe("security", () => {
  test("every page gets the security headers and a new CSP nonce", async ({ request }) => {
    const nonces = new Set<string>();
    for (const attempt of [1, 2]) {
      const response = await request.get("/es");
      expect(response.status(), `request ${attempt}`).toBe(200);
      const headers = response.headers();
      const nonce = /'nonce-([^']+)'/.exec(headers["content-security-policy"] ?? "")?.[1] ?? "";
      expect(headers).toMatchObject({
        "content-security-policy": buildCsp(nonce, { isDev: isDevStack }),
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY",
        "referrer-policy": "strict-origin-when-cross-origin",
        "permissions-policy": "camera=(), microphone=(), geolocation=(), usb=()",
        "cross-origin-opener-policy": "same-origin",
      });
      expect(headers).not.toHaveProperty("x-powered-by");
      const scripts = ((await response.text()).match(/<script\b[^>]*>/g) ?? []).filter(
        (script) => !script.includes('type="application/ld+json"'),
      );
      expect(scripts.length).toBeGreaterThan(0);
      for (const script of scripts) {
        expect(script).toContain(`nonce="${nonce}"`);
      }
      nonces.add(nonce);
    }
    expect(nonces.size).toBe(2);
  });

  test("plain HTTP is redirected to HTTPS", async ({ request }) => {
    const response = await request.get(`${HTTP_URL}/es`, { maxRedirects: 0 });
    expect(response.status()).toBe(301);
    expect(response.headers().location).toBe(`${BASE_URL}/es`);
  });

  test("an unknown Host gets no answer on either port", async ({ request }) => {
    const headers = { Host: "evil.example" };

    await expect(request.get(`${BASE_URL}/es`, { headers })).rejects.toThrow();
    await expect(request.get(`${HTTP_URL}/es`, { headers })).rejects.toThrow();
  });

  test("a forged port never reaches a redirect", async ({ request }) => {
    const response = await request.get("/", { headers: { Host: "localhost:9999" }, maxRedirects: 0 });

    expect(response.status()).toBe(307);
    expect(response.headers().location).not.toContain("9999");
  });

  test("the Next.js image optimizer is closed", async ({ request }) => {
    const response = await request.get("/_next/image?url=%2Ffavicon.ico&w=64&q=75");
    expect(response.status()).toBe(404);
  });

  test("auth pages are kept out of search engines", async ({ request }) => {
    for (const path of AUTH_PATHS) {
      const response = await request.get(`/es${path}`);
      expect(await response.text(), path).toMatch(/<meta name="robots" content="noindex, nofollow"/);
    }
  });
});

test.describe("navigation", () => {
  test("/ opens the language of the visitor", async ({ request }) => {
    for (const [acceptLanguage, locale] of [
      ["es-AR,es;q=0.9", "es"],
      ["en-US,en;q=0.9", "en"],
    ]) {
      const response = await request.get("/", { headers: { "Accept-Language": acceptLanguage }, maxRedirects: 0 });
      expect(response.status(), acceptLanguage).toBe(307);
      expect(new URL(response.headers().location, BASE_URL).pathname).toBe(`/${locale}`);
    }
  });

  test("unknown pages answer a localized 404", async ({ page }) => {
    for (const locale of LOCALES) {
      const response = await page.goto(`/${locale}/e2e-missing-page`);
      expect(response?.status()).toBe(404);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(messages[locale].NotFound.title);
    }
  });

  test("protected pages send visitors without a session to the login", async ({ page }) => {
    for (const path of PROTECTED_PATHS) {
      await page.goto(`/es${path}`);
      await expect(page).toHaveURL(redirectedToLogin(`/es${path}`));
    }
  });

  test("the language switcher keeps the current page", async ({ page, loginPage }) => {
    await loginPage.goto();
    await loginPage.header.chooseLanguage("en");
    await expect(page).toHaveURL(`${BASE_URL}/en/login`);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(loginPage.heading).toHaveText(messages.en.Auth.login.title);
  });

  test("the chosen currency is remembered across pages", async ({ context, homePage, loginPage }) => {
    await homePage.goto();
    await expect(homePage.header.currency).toHaveText(DEFAULT_CURRENCY);
    await homePage.header.chooseCurrency("USD");
    await expect(homePage.header.currency).toHaveText("USD");
    await loginPage.goto();
    await expect(loginPage.header.currency).toHaveText("USD");
    const cookie = (await context.cookies()).find(({ name }) => name === CURRENCY_COOKIE);
    expect(cookie).toMatchObject({ value: "USD", path: "/", secure: true, sameSite: "Lax" });
  });
});
