import {
  getRedirectUrl,
  isRewrite,
  unstable_doesMiddlewareMatch,
} from "next/experimental/testing/server";
import { NextRequest } from "next/server";

import { config, proxy } from "./proxy";

const nextConfig = {};

function request(path: string, cookie?: string) {
  return new NextRequest(`https://localhost:8443${path}`, {
    headers: cookie ? { cookie } : {},
  });
}

function nonceOf(csp: string | null): string | undefined {
  return csp?.match(/'nonce-([^']+)'/)?.[1];
}

describe("matcher", () => {
  it.each(["/", "/es", "/en/account", "/es/products/drill"])("runs on pages (%s)", (url) => {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig, url })).toBe(true);
  });

  it.each([
    "/api/v1/brands",
    "/_next/static/chunks/app.js",
    "/_next/image",
    "/media/products/1.webp",
    "/healthz",
    "/favicon.ico",
    "/robots.txt",
  ])("skips %s", (url) => {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig, url })).toBe(false);
  });

  it("skips router prefetches", () => {
    expect(
      unstable_doesMiddlewareMatch({ config, nextConfig, url: "/es", headers: { "next-router-prefetch": "1" } }),
    ).toBe(false);
  });
});

describe("proxy", () => {
  it("redirects the root to the default locale", () => {
    const response = proxy(request("/"));

    expect(getRedirectUrl(response)).toBe("https://localhost:8443/es");
  });

  it("sends a new CSP per request and forwards its nonce to rendering", () => {
    const first = proxy(request("/es"));
    const second = proxy(request("/es"));
    const nonce = nonceOf(first.headers.get("content-security-policy"));

    expect(nonce).toBeDefined();
    expect(nonceOf(second.headers.get("content-security-policy"))).not.toBe(nonce);
    expect(first.headers.get("x-middleware-request-x-nonce")).toBe(nonce);
    expect(first.headers.get("x-middleware-request-content-security-policy")).toContain(`'nonce-${nonce}'`);
  });

  it("sends the report endpoint and the report-only policy on every page", () => {
    const response = proxy(request("/es"));

    expect(response.headers.get("reporting-endpoints")).toBe('csp="/api/v1/csp-reports"');
    expect(response.headers.get("content-security-policy-report-only")).toContain("require-trusted-types-for");
  });

  it("redirects protected pages to login when there is no session cookie", () => {
    const response = proxy(request("/en/account?tab=profile"));

    expect(getRedirectUrl(response)).toBe(
      "https://localhost:8443/en/login?next=%2Fen%2Faccount%3Ftab%3Dprofile",
    );
    expect(response.headers.get("content-security-policy")).toContain("'strict-dynamic'");
  });

  it("lets protected pages render when the session cookie exists", () => {
    const response = proxy(request("/es/account", "__Host-access=token"));

    expect(getRedirectUrl(response)).toBeNull();
    expect(isRewrite(response) || response.headers.get("x-middleware-next") === "1").toBe(true);
  });

  it("does not treat similar paths as protected", () => {
    expect(getRedirectUrl(proxy(request("/es/accounting")))).toBeNull();
  });
});
