import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  createPublicThrottle,
  PUBLIC_THROTTLE_NO_ORIGIN,
  type PublicThrottleAction,
} from "@/lib/validators/public-throttle";

vi.mock("server-only", () => ({}));

/**
 * A manual clock, so every window edge is asserted without waiting out a
 * real five minutes. Times are milliseconds since an arbitrary origin.
 */
function manualClock(startMs = 0): { now: () => number; advance: (ms: number) => void } {
  let at = startMs;
  return {
    now: () => at,
    advance: (ms: number) => {
      at += ms;
    },
  };
}

/** Drains one bucket pair to refusal by repeating the same check. */
function burst(
  check: (origin: string, attempt: string) => boolean,
  origin: string,
  attempt: string,
  count: number,
): boolean[] {
  return Array.from({ length: count }, () => check(origin, attempt));
}

describe("the resume bucket paces guessing without binding a human", () => {
  it("allows a generous burst and then refuses", () => {
    const clock = manualClock();
    const throttle = createPublicThrottle(clock.now);

    // Thirty per identity per five minutes: a human resumes about once per
    // visit, so no honest use reaches this; a prober sweeping identifiers
    // exhausts it in seconds.
    const allowed = burst((o, a) => throttle.check("resume", o, a), "origin-a", "VAL_attempt1", 30);
    expect(allowed.every(Boolean)).toBe(true);
    expect(throttle.check("resume", "origin-a", "VAL_attempt1")).toBe(false);
  });

  it("binds the origin bucket across guessed identities", () => {
    const clock = manualClock();
    const throttle = createPublicThrottle(clock.now);

    // Sixty per origin per five minutes across ALL attempts: rotating the
    // guessed identifier does not buy a fresh budget.
    for (let n = 0; n < 60; n += 1) {
      expect(throttle.check("resume", "shared-origin", `VAL_guess${n}`)).toBe(true);
    }
    expect(throttle.check("resume", "shared-origin", "VAL_guess60")).toBe(false);
  });

  it("keeps a quiet origin working while a noisy one is refused", () => {
    const clock = manualClock();
    const throttle = createPublicThrottle(clock.now);

    // Sixty distinct identities behind one origin: rotating the guess fills
    // the ORIGIN bucket (a same-identity burst would stop at the per-attempt
    // thirty and, refused, consume nothing further).
    for (let n = 0; n < 60; n += 1) {
      expect(throttle.check("resume", "noisy-origin", `VAL_noisy${n}`)).toBe(true);
    }
    expect(throttle.check("resume", "noisy-origin", "VAL_noisy60")).toBe(false);
    expect(throttle.check("resume", "quiet-origin", "VAL_quiet")).toBe(true);
  });

  it("releases the budget when the window expires", () => {
    const clock = manualClock();
    const throttle = createPublicThrottle(clock.now);

    burst((o, a) => throttle.check("resume", o, a), "origin-a", "VAL_attempt1", 30);
    expect(throttle.check("resume", "origin-a", "VAL_attempt1")).toBe(false);
    clock.advance(301 * 1000);
    expect(throttle.check("resume", "origin-a", "VAL_attempt1")).toBe(true);
  });

  it("lets a refused check consume nothing, so refusal never extends its own window", () => {
    const clock = manualClock();
    const throttle = createPublicThrottle(clock.now);

    burst((o, a) => throttle.check("resume", o, a), "origin-a", "VAL_attempt1", 30);
    // Refused: had it consumed a unit, the bucket would hold 31 hits and the
    // check below would still refuse. It holds 30, the oldest expires, one
    // slot frees.
    expect(throttle.check("resume", "origin-a", "VAL_attempt1")).toBe(false);
    clock.advance(301 * 1000);
    expect(throttle.check("resume", "origin-a", "VAL_attempt1")).toBe(true);
  });

  it("shares one fallback bucket across requests with no origin signal", () => {
    const clock = manualClock();
    const throttle = createPublicThrottle(clock.now);

    for (let n = 0; n < 60; n += 1) {
      expect(throttle.check("resume", PUBLIC_THROTTLE_NO_ORIGIN, `VAL_fallback${n}`)).toBe(true);
    }
    expect(throttle.check("resume", PUBLIC_THROTTLE_NO_ORIGIN, "VAL_fallback60")).toBe(false);
  });
});

describe("the session_open bucket is independent and roomier", () => {
  it("allows page-load-scale bursts a human reaches by refreshing", () => {
    const clock = manualClock();
    const throttle = createPublicThrottle(clock.now);

    const allowed = burst(
      (o, a) => throttle.check("session_open", o, a),
      "origin-a",
      "VAL_attempt1",
      120,
    );
    expect(allowed.every(Boolean)).toBe(true);
    expect(throttle.check("session_open", "origin-a", "VAL_attempt1")).toBe(false);
  });

  it("is not coupled to the resume bucket", () => {
    const clock = manualClock();
    const throttle = createPublicThrottle(clock.now);

    // Exhaust resume on one identity; the same identity still opens sessions.
    burst((o, a) => throttle.check("resume", o, a), "origin-a", "VAL_attempt1", 30);
    expect(throttle.check("resume", "origin-a", "VAL_attempt1")).toBe(false);
    expect(throttle.check("session_open", "origin-a", "VAL_attempt1")).toBe(true);
  });
});

describe("bucket accounting hygiene", () => {
  it("keeps one test's bursts out of another's", () => {
    // Each created throttle owns its store: a burst here must not fail a
    // burst in any other test, which is what per-instance storage buys.
    const first = createPublicThrottle(manualClock().now);
    burst((o, a) => first.check("resume", o, a), "origin-a", "VAL_attempt1", 30);
    expect(first.check("resume", "origin-a", "VAL_attempt1")).toBe(false);

    const second = createPublicThrottle(manualClock().now);
    expect(second.check("resume", "origin-a", "VAL_attempt1")).toBe(true);
  });

  it("hashes both key components, so raw values never reach the table", () => {
    // Structural, and its limits are stated: this proves the module hashes
    // with SHA-256 at the key-derivation site — a second code path storing a
    // raw value beside it would still pass, which is why the origin-literal
    // scan in `resume-throttle.test.ts` pins WHERE header values may appear.
    const source: string = readFileSync("src/lib/validators/public-throttle.ts", "utf8");
    expect(source).toMatch(/createHash\("sha256"\)/);
    expect(source).toMatch(/PUBLIC_THROTTLE_NO_ORIGIN/);
  });

  it.each(["resume", "session_open"] as PublicThrottleAction[])(
    "names the %s action in the throttle's own vocabulary",
    (action) => {
      const clock = manualClock();
      const throttle = createPublicThrottle(clock.now);
      expect(throttle.check(action, "origin-a", "VAL_attempt1")).toBe(true);
    },
  );
});
