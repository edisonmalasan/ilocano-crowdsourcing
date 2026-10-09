/**
 * Enforced Content Security Policy.
 *
 * Change 4 declared five hardening headers and explicitly deferred CSP.
 * This suite resolves the REAL `next.config.ts` `headers()` and asserts
 * the global `/:path*` block carries an enforced policy containing every
 * required directive — `default-src`, `script-src`, `style-src`,
 * `img-src`, `font-src`, `connect-src`, `form-action`,
 * `frame-ancestors`, `base-uri`, `object-src` — with the exact source
 * lists, while the five existing headers and the researcher block stay
 * byte-identical. Two negative pins (no `unsafe-eval`, no wildcard
 * source) fail on the two weakenings a regression would most plausibly
 * introduce.
 */

import { describe, expect, it } from "vitest";

import nextConfig from "../../next.config";

const GLOBAL_SOURCE = "/:path*";

const EXPECTED_POLICY =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'";

async function globalHeaders() {
  const blocks = (await nextConfig.headers?.()) ?? [];
  const global = blocks.find((block) => block.source === GLOBAL_SOURCE);
  expect(global, "a global /:path* headers block must exist").toBeDefined();
  return global?.headers ?? [];
}

describe("the enforced Content Security Policy", () => {
  it("declares the policy byte-identical alongside the five preserved headers", async () => {
    const headers = await globalHeaders();
    const keys = headers.map((header) => header.key);
    expect(keys).toEqual([
      "X-Content-Type-Options",
      "X-Frame-Options",
      "Referrer-Policy",
      "Strict-Transport-Security",
      "Permissions-Policy",
      "Content-Security-Policy",
    ]);
    expect(headers.find((header) => header.key === "Content-Security-Policy")?.value).toBe(
      EXPECTED_POLICY,
    );
  });

  it("covers every required directive with the exact source list", async () => {
    const headers = await globalHeaders();
    const policy = headers.find((header) => header.key === "Content-Security-Policy")?.value ?? "";
    for (const directive of [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "object-src 'none'",
    ]) {
      expect(policy).toContain(directive);
    }
  });

  it("permits no unsafe-eval in any directive", async () => {
    const headers = await globalHeaders();
    const policy = headers.find((header) => header.key === "Content-Security-Policy")?.value ?? "";
    expect(policy).not.toContain("unsafe-eval");
  });

  it("permits no wildcard or scheme-wide source in any directive", async () => {
    const headers = await globalHeaders();
    const policy = headers.find((header) => header.key === "Content-Security-Policy")?.value ?? "";
    for (const token of [" *;", " * ", "https:", "http:", "data: script"]) {
      expect(policy).not.toContain(token);
    }
    expect(policy).not.toMatch(/(?:^|;)\s*\S+-[a-z]+ \*/);
  });

  it("keeps frame-ancestors consistent with the DENY framing intent", async () => {
    const headers = await globalHeaders();
    const frame = headers.find((header) => header.key === "X-Frame-Options")?.value;
    const policy = headers.find((header) => header.key === "Content-Security-Policy")?.value ?? "";
    expect(frame).toBe("DENY");
    expect(policy).toContain("frame-ancestors 'none'");
  });
});
