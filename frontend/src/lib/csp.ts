const REPORT_GROUP = "csp";
const REPORT_PATH = "/api/v1/csp-reports";
const REPORT_DIRECTIVES = [`report-uri ${REPORT_PATH}`, `report-to ${REPORT_GROUP}`];

export const REPORTING_ENDPOINTS = `${REPORT_GROUP}="${REPORT_PATH}"`;

export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

export function buildCsp(nonce: string, { isDev }: { isDev: boolean }): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
    "worker-src 'self'",
    "upgrade-insecure-requests",
    ...REPORT_DIRECTIVES,
  ].join("; ");
}

export function buildReportOnlyCsp(): string {
  return ["require-trusted-types-for 'script'", ...REPORT_DIRECTIVES].join("; ");
}
