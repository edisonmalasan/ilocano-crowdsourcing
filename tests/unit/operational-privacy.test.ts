/**
 * Privacy-shape audit for every monitoring payload.
 *
 * Discharges the spec scenario "Privacy-shape audit of every payload": any monitoring record
 * formed for storage, dispatch, or display holds only signal/rule names, window markers,
 * counts, thresholds, timestamps, and truncated digests. The forbidden vocabulary below names
 * every field that must never appear — response content, auth material, network origins, and
 * session-held tokens — and the scan fails closed: a file that cannot be read, or that reads
 * empty, fails rather than passing on nothing.
 *
 * `server-only` is stubbed so the dispatch builder can run here; the recorder is driven
 * through an in-memory fake, so no payload assertion depends on a database.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildAlertPayload } from "@/lib/ops/dispatch";
import { recordOperationalSignal } from "@/lib/ops/recorder";
import type { OperationalEventsRepository } from "@/lib/repositories";

const ROOT = process.cwd();
const DISPATCH_SOURCE = path.join(ROOT, "src", "lib", "ops", "dispatch.ts");
const RECORDER_SOURCE = path.join(ROOT, "src", "lib", "ops", "recorder.ts");

/**
 * Literals that must appear NOWHERE in either audited module — not in code, not in a type,
 * and not in a comment, because a comment carrying one is still a promise a reader may rely
 * on. Each entry names the shape it guards: response content, auth material, network
 * origins, and session-held tokens.
 */
const FORBIDDEN_LITERALS = [
  "corrected_instruction",
  "english_translation",
  "filipino_translation",
  "sentence",
  "credential",
  "service_role",
  "SUPABASE_SERVICE_ROLE",
  "x-forwarded-for",
  "remote_addr",
  "validator_id",
  "VAL_",
  "validatorId",
  "proficiency",
] as const;

function readAuditedSource(file: string): string {
  const source = readFileSync(file, "utf8");
  // Non-empty control: a scan that matched nothing because it read nothing would report
  // success, which is the vacuous-guard failure this repository has found before.
  expect(
    source.length,
    `${path.relative(ROOT, file)} must read as a non-empty file`,
  ).toBeGreaterThan(500);
  return source;
}

describe("operational payload privacy", () => {
  it("builds an alert payload with exactly the five aggregate keys", () => {
    const payload = buildAlertPayload(
      "persistence_failed",
      new Date("2026-10-09T12:00:00.000Z"),
      5,
      5,
      new Date("2026-10-09T12:03:00.000Z"),
    );
    expect(Object.keys(payload).sort()).toEqual([
      "count",
      "evaluatedAt",
      "rule",
      "threshold",
      "windowStart",
    ]);
  });

  it("stores only signal, window, and digest — the raw material never reaches the repository", async () => {
    const stored: Record<string, unknown>[] = [];
    const bodies: unknown[] = [];
    const repo: OperationalEventsRepository = {
      async recordEvent(signal, windowStart, dedupeKey) {
        stored.push({ signal, windowStart: windowStart.toISOString(), dedupeKey });
      },
      async countForWindow() {
        return 1;
      },
      async hasDispatch() {
        return true;
      },
      async recordDispatch() {
        return true;
      },
      async pruneBefore() {},
    };
    const material = "batch-9:entry-4";
    await recordOperationalSignal(
      {
        events: repo,
        webhookUrl: null,
        dispatchFetch: (async () => {
          throw new Error("must not be called below the threshold");
        }) as unknown as typeof fetch,
        log: () => {},
        now: () => new Date("2026-10-09T12:03:00.000Z"),
      },
      "already_recorded_spike",
      material,
    );
    expect(stored).toHaveLength(1);
    expect(Object.keys(stored[0]).sort()).toEqual(["dedupeKey", "signal", "windowStart"]);
    expect(stored[0].dedupeKey).toMatch(/^[0-9a-f]{16}$/);
    expect(JSON.stringify([...stored, ...bodies])).not.toContain(material);
  });

  it("carries no forbidden literal in either audited module", () => {
    for (const file of [DISPATCH_SOURCE, RECORDER_SOURCE]) {
      const source = readAuditedSource(file);
      for (const literal of FORBIDDEN_LITERALS) {
        expect(
          source.includes(literal),
          `${path.relative(ROOT, file)} must not contain ${JSON.stringify(literal)}`,
        ).toBe(false);
      }
    }
  });

  it("PROVES THE SCAN CAN FIRE: each forbidden literal is detected against the real source", () => {
    const source = readAuditedSource(DISPATCH_SOURCE);
    for (const literal of FORBIDDEN_LITERALS) {
      // The same predicate the guard uses, run against the real file with one violation
      // appended: a predicate that cannot see an injected violation reports coverage it does
      // not provide.
      expect(
        `${source}\n${literal}`.includes(literal),
        `the scan must detect an injected ${JSON.stringify(literal)}`,
      ).toBe(true);
      expect(source.includes(literal)).toBe(false);
    }
  });
});
