import { hasLocale } from "next-intl";
import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";

import { routing } from "@/i18n/routing";
import { buildCsp, buildReportOnlyCsp, createNonce, REPORTING_ENDPOINTS } from "@/lib/csp";
import { isProtectedPath } from "@/lib/routes";
import { ACCESS_COOKIE } from "@/lib/session-cookies";

const handleI18nRouting = createMiddleware(routing);

function loginRedirect(request: NextRequest): NextResponse | null {
  const { pathname, search } = request.nextUrl;
  const [, locale, ...rest] = pathname.split("/");
  if (!hasLocale(routing.locales, locale) || request.cookies.has(ACCESS_COOKIE)) {
    return null;
  }
  if (!isProtectedPath(`/${rest.join("/")}`)) {
    return null;
  }
  const url = new URL(`/${locale}/login`, request.url);
  url.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(url);
}

export function proxy(request: NextRequest): NextResponse {
  const nonce = createNonce();
  const csp = buildCsp(nonce, { isDev: process.env.NODE_ENV === "development" });

  const response = loginRedirect(request) ?? handleI18nRouting(withCspHeaders(request, nonce, csp));
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("Content-Security-Policy-Report-Only", buildReportOnlyCsp());
  response.headers.set("Reporting-Endpoints", REPORTING_ENDPOINTS);
  return response;
}

function withCspHeaders(request: NextRequest, nonce: string, csp: string): NextRequest {
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  return new NextRequest(request, { headers });
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|media|healthz|.*\\..*).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
