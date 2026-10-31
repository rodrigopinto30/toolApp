import { buildCsp, buildReportOnlyCsp, createNonce, REPORTING_ENDPOINTS } from "./csp";

describe("createNonce", () => {
  it("returns 16 random bytes in base64", () => {
    const nonce = createNonce();

    expect(atob(nonce)).toHaveLength(16);
    expect(createNonce()).not.toBe(nonce);
  });
});

describe("buildCsp", () => {
  it("only lets scripts with the nonce run", () => {
    const csp = buildCsp("abc", { isDev: false });

    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic';");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
  });

  it("allows eval only in development", () => {
    expect(buildCsp("abc", { isDev: true })).toContain("'strict-dynamic' 'unsafe-eval';");
  });

  it("reports violations in both formats", () => {
    const csp = buildCsp("abc", { isDev: false });

    expect(csp).toContain("report-uri /api/v1/csp-reports");
    expect(csp).toContain("report-to csp");
    expect(REPORTING_ENDPOINTS).toBe('csp="/api/v1/csp-reports"');
  });
});

describe("buildReportOnlyCsp", () => {
  it("tries Trusted Types and reports what would break", () => {
    const csp = buildReportOnlyCsp();

    expect(csp).toContain("require-trusted-types-for 'script'");
    expect(csp).toContain("report-to csp");
    expect(csp).not.toContain("script-src");
  });
});
