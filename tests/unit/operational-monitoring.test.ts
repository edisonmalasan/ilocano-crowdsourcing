import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  buildDedupeDigest,
  floorWindowStart,
  isBreach,
  isOperationalSignal,
  OPERATIONAL_SIGNALS,
  OPERATIONAL_THRESHOLDS,
  OPERATIONAL_WINDOW_SECONDS,
  truncateDigest,
  type OperationalSignal,
} from "@/lib/ops/monitoring";

describe("operational signal taxonomy", () => {
  it("is a closed set of exactly eight signals", () => {
    expect([...OPERATIONAL_SIGNALS]).toEqual([
      "enroll_failed",
      "resume_failed",
      "allocation_failed",
      "persistence_failed",
      "retry_exhausted",
      "already_recorded_spike",
      "reservation_abandoned",
      "researcher_signin_failed",
    ]);
  });

  it("narrows only exact string matches, rejecting lookalikes", () => {
    expect(isOperationalSignal("enroll_failed")).toBe(true);
    expect(isOperationalSignal("ENROLL_FAILED")).toBe(false);
    expect(isOperationalSignal("enroll_failed ")).toBe(false);
    expect(isOperationalSignal("")).toBe(false);
    expect(isOperationalSignal(null)).toBe(false);
    expect(isOperationalSignal(undefined)).toBe(false);
    expect(isOperationalSignal(42)).toBe(false);
    expect(isOperationalSignal({ toString: () => "enroll_failed" })).toBe(false);
    // `includes` on a literal tuple performs no prototype lookup, so these are rejected as
    // ordinary unapproved values rather than hitting Array prototype members.
    expect(isOperationalSignal("constructor")).toBe(false);
    expect(isOperationalSignal("toString")).toBe(false);
  });

  it("covers every signal in the threshold table and nothing else", () => {
    expect(Object.keys(OPERATIONAL_THRESHOLDS).sort()).toEqual([...OPERATIONAL_SIGNALS].sort());
  });
});

describe("operational thresholds", () => {
  it("holds the documented per-signal values", () => {
    expect(OPERATIONAL_THRESHOLDS).toEqual({
      enroll_failed: 10,
      resume_failed: 10,
      allocation_failed: 10,
      persistence_failed: 5,
      retry_exhausted: 20,
      already_recorded_spike: 20,
      reservation_abandoned: 10,
      researcher_signin_failed: 10,
    });
  });

  it("uses a five-minute window", () => {
    expect(OPERATIONAL_WINDOW_SECONDS).toBe(300);
  });
});

describe("window flooring", () => {
  it("floors 12:04:59 to the :00 bucket", () => {
    expect(floorWindowStart(new Date("2026-10-09T12:04:59.000Z"))).toEqual(
      new Date("2026-10-09T12:00:00.000Z"),
    );
  });

  it("starts a new bucket at exactly 12:05:00", () => {
    expect(floorWindowStart(new Date("2026-10-09T12:05:00.000Z"))).toEqual(
      new Date("2026-10-09T12:05:00.000Z"),
    );
  });

  it("floors sub-second remainders within a bucket", () => {
    expect(floorWindowStart(new Date("2026-10-09T12:09:59.999Z"))).toEqual(
      new Date("2026-10-09T12:05:00.000Z"),
    );
  });

  it("is idempotent: flooring a window start returns it unchanged", () => {
    const start = new Date("2026-10-09T12:10:00.000Z");
    expect(floorWindowStart(start)).toEqual(start);
  });
});

describe("breach evaluation", () => {
  const breachCases: Array<[OperationalSignal, number]> = [
    ["enroll_failed", 10],
    ["resume_failed", 10],
    ["allocation_failed", 10],
    ["persistence_failed", 5],
    ["retry_exhausted", 20],
    ["already_recorded_spike", 20],
    ["reservation_abandoned", 10],
    ["researcher_signin_failed", 10],
  ];
  it.each(breachCases)("breaches %s at exactly its threshold of %i", (signal, threshold) => {
    expect(isBreach(signal, threshold - 1)).toBe(false);
    expect(isBreach(signal, threshold)).toBe(true);
    expect(isBreach(signal, threshold + 1)).toBe(true);
  });

  it("never breaches on zero for any signal", () => {
    for (const signal of OPERATIONAL_SIGNALS) {
      expect(isBreach(signal, 0)).toBe(false);
    }
  });
});

describe("dedupe digests", () => {
  it("truncates to 16 hex characters", () => {
    expect(truncateDigest("0123456789abcdef0123456789abcdef")).toBe("0123456789abcdef");
    expect(truncateDigest("0123456789abcdef0123456789abcdef")).toHaveLength(16);
  });

  it("is deterministic for the same inputs", () => {
    expect(buildDedupeDigest("persistence_failed", "nonce-1")).toBe(
      buildDedupeDigest("persistence_failed", "nonce-1"),
    );
  });

  it("differs across materials and across signals", () => {
    const base = buildDedupeDigest("persistence_failed", "nonce-1");
    expect(base).toHaveLength(16);
    expect(buildDedupeDigest("persistence_failed", "nonce-2")).not.toBe(base);
    expect(buildDedupeDigest("enroll_failed", "nonce-1")).not.toBe(base);
  });

  it("emits lowercase hex only", () => {
    expect(buildDedupeDigest("enroll_failed", "nonce-1")).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("module purity boundary", () => {
  it("imports nothing forbidden: no server marker, no env, no Supabase, no logger", () => {
    const source = readFileSync("src/lib/ops/monitoring.ts", "utf8");
    // Anchored on import statements, not bare substrings: prose mentioning a forbidden module
    // must not satisfy (or defeat) an import guard.
    expect(source).not.toMatch(/^\s*import\s+["']server-only["']/m);
    expect(source).not.toMatch(/from\s+["']server-only["']/);
    expect(source).not.toMatch(/@supabase\//);
    expect(source).not.toMatch(/SUPABASE_/);
    expect(source).not.toMatch(/console\.(log|error|warn|info|debug)/);
    expect(source).not.toMatch(/process\.env/);
  });
});
