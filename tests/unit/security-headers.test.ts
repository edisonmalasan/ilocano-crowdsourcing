/**
 * Browser-hardening response headers.
 *
 * `next.config.ts` `headers()` previously declared exactly one block,
 * `/researcher/:path*`, so no public route sent `X-Content-Type-Options`,
 * `X-Frame-Options`, `Referrer-Policy`, `Strict-Transport-Security`, or
 * `Permissions-Policy`. These cases resolve the REAL config and assert the
 * global `/:path*` block carries exactly the five declared pairs while the
 * researcher block stays byte-identical — no fixture server, no CLI spawn.
 *
 * The probe rests on one framework premise, stated rather than hidden:
 * Next.js applies EVERY block whose `source` matches the request path and
 * merges their header lists, so the global block composes with the
 * researcher block instead of replacing it. That premise is observed once
 * on local dev at Apply (a researcher response shows both sets) and
 * recorded in the change's tasks.md — this suite asserts both blocks are
 * DECLARED, which is what the config owns.
 */

import { describe, expect, it } from "vitest";

import nextConfig from "../../next.config";

const GLOBAL_SOURCE = "/:path*";
const RESEARCHER_SOURCE = "/researcher/:path*";

const EXPECTED_GLOBAL: Array<{ key: string; value: string }> = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const EXPECTED_RESEARCHER: Array<{ key: string; value: string }> = [
  { key: "Cache-Control", value: "private, no-store, max-age=0" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

async function resolvedHeaders() {
  const headers = await nextConfig.headers?.();
  expect(headers, "next.config.ts must declare a headers() function").toBeDefined();
  return headers ?? [];
}

describe("the browser-hardening response headers", () => {
  it("declares each source exactly once, so no shadowed block hides a header", async () => {
    const blocks = await resolvedHeaders();
    const sources = blocks.map((block) => block.source);
    expect(new Set(sources).size).toBe(sources.length);
  });

  it("keeps the researcher block byte-identical (passes before and after the fix)", async () => {
    const blocks = await resolvedHeaders();
    const researcher = blocks.find((block) => block.source === RESEARCHER_SOURCE);
    expect(researcher, "the researcher headers block must still exist").toBeDefined();
    expect(researcher?.headers).toEqual(EXPECTED_RESEARCHER);
  });

  it("declares the global block with exactly the five hardening pairs", async () => {
    const blocks = await resolvedHeaders();
    const global = blocks.find((block) => block.source === GLOBAL_SOURCE);
    expect(global, "a global /:path* headers block must exist").toBeDefined();
    expect(global?.headers).toEqual(EXPECTED_GLOBAL);
  });

  it("switches off geolocation access, which the anonymous model forbids collecting", async () => {
    const blocks = await resolvedHeaders();
    const global = blocks.find((block) => block.source === GLOBAL_SOURCE);
    const permissions = global?.headers.find((header) => header.key === "Permissions-Policy");
    expect(permissions, "the global block must declare Permissions-Policy").toBeDefined();
    expect(permissions?.value).toContain("geolocation=()");
  });
});
