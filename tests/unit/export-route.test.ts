/**
 * The researcher export download route, driven with mocks — no credential, no database.
 *
 * `server-only` and `next/headers` cannot run under Vitest, so both markers are stubbed; the
 * boundary they mark is asserted structurally elsewhere. What this file owns is the handler's
 * own contract: refusal before privilege on a bad session, and a dated ZIP response on a good
 * one. The derivation inside the ZIP is owned by `web-download.test.ts`, not re-derived here.
 */
import { describe, expect, it, vi } from "vitest";
import { unzipSync } from "fflate";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  cookieValue: undefined as string | undefined,
  adminEnv: null as { operatorSecrets: readonly string[]; sessionSecret: string } | null,
  repositoriesCalls: [] as string[],
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (_name: string) => (h.cookieValue === undefined ? undefined : { value: h.cookieValue }),
  }),
}));

vi.mock("@/lib/admin/env", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return { ...original, getAdminEnv: () => h.adminEnv };
});

vi.mock("@/lib/repositories/supabase", () => ({
  createSupabaseRepositories: () => ({
    datasetEntries: {
      listActive: async () => {
        h.repositoriesCalls.push("entries.listActive");
        return [];
      },
    },
    validations: {
      listForEntries: async () => {
        h.repositoriesCalls.push("validations.listForEntries");
        return [];
      },
    },
    validators: {
      listByIds: async () => {
        h.repositoriesCalls.push("validators.listByIds");
        return [];
      },
    },
  }),
}));

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { issueResearcherSession } from "@/lib/admin/session";
import { GET } from "@/app/researcher/(protected)/export/route";

const NOW = new Date("2026-10-04T12:00:00.000Z").getTime();
const OPERATOR_SECRET = "route-operator-secret";
const SESSION_SECRET = "route-session-secret";

function signedSession(): string {
  return issueResearcherSession({
    ordinal: 1,
    credential: OPERATOR_SECRET,
    nowMs: NOW,
    secret: SESSION_SECRET,
  });
}

describe("GET /researcher/export", () => {
  it("delegates authorization to the verifying core, which names the guard itself", () => {
    // Structural half of the authorization claim, in two halves because the route is thin on
    // purpose. Layouts do not run for Route Handlers, so a download that forgot verification
    // would serve the corpus to anyone: the route must reach the core that verifies, and the
    // core must name the guard. The behavioural tests below prove the verification works;
    // these prove it is there to be called.
    const route = readFileSync(
      fileURLToPath(
        new URL("../../src/app/researcher/(protected)/export/route.ts", import.meta.url),
      ),
      "utf8",
    );
    expect(route).toContain("buildResearchDownload");
    const core = readFileSync(
      fileURLToPath(new URL("../../src/lib/export/web-download.ts", import.meta.url)),
      "utf8",
    );
    expect(core).toContain("resolveResearcherAccess");
  });

  it("refuses without a session and touches no repository", async () => {
    h.cookieValue = undefined;
    h.adminEnv = null;
    h.repositoriesCalls.length = 0;

    const response = await GET();

    expect(response.status).toBe(403);
    expect(await response.text()).toBe(
      "This area is not available. A valid researcher session is required.",
    );
    expect(h.repositoriesCalls).toEqual([]);
  });

  it("serves a dated ZIP to a signed session", async () => {
    h.cookieValue = signedSession();
    h.adminEnv = { operatorSecrets: [OPERATOR_SECRET], sessionSecret: SESSION_SECRET };
    h.repositoriesCalls.length = 0;
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    try {
      const response = await GET();

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("application/zip");
      expect(response.headers.get("Content-Disposition")).toBe(
        'attachment; filename="sadino-research-export-2026-10-04.zip"',
      );
      const names = Object.keys(unzipSync(new Uint8Array(await response.arrayBuffer()))).sort();
      expect(names).toEqual(
        [
          "validations.json",
          "validations.csv",
          "summary.json",
          "validated-dataset.json",
          "validated-dataset.csv",
        ].sort(),
      );
      expect(h.repositoriesCalls).toEqual(["entries.listActive", "validators.listByIds"]);
    } finally {
      vi.useRealTimers();
    }
  });
});
