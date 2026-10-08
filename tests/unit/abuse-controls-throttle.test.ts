import { describe, expect, it, vi } from "vitest";

import { createPublicThrottle } from "@/lib/validators/public-throttle";

vi.mock("server-only", () => ({}));

/**
 * The three new buckets from `public-participant-abuse-controls`.
 *
 * Pins each threshold from the design (D2), the enroll no-actor shape, the
 * missing-actor closed gate, and that the new buckets share nothing with the
 * shipped `resume`/`session_open` budgets.
 */
describe("abuse-controls throttle buckets", () => {
  it("paces enroll at 30 per origin with no actor bucket", () => {
    const throttle = createPublicThrottle(() => 0);
    for (let n = 0; n < 30; n += 1) {
      expect(throttle.check("enroll", "origin-a")).toBe(true);
    }
    expect(throttle.check("enroll", "origin-a")).toBe(false);
    // A second origin is unaffected by the first's exhaustion.
    expect(throttle.check("enroll", "origin-b")).toBe(true);
  });

  it("paces allocate at 60 per origin and 20 per attempt", () => {
    const throttle = createPublicThrottle(() => 0);
    for (let n = 0; n < 20; n += 1) {
      expect(throttle.check("allocate", "origin-a", "VAL_actor1")).toBe(true);
    }
    // The actor bucket binds first: same actor refused, fresh actor allowed.
    expect(throttle.check("allocate", "origin-a", "VAL_actor1")).toBe(false);
    expect(throttle.check("allocate", "origin-a", "VAL_actor2")).toBe(true);
  });

  it("paces submit at 300 per origin and 30 per batch", () => {
    const throttle = createPublicThrottle(() => 0);
    for (let n = 0; n < 30; n += 1) {
      expect(throttle.check("submit", "origin-a", "BAT_batch1")).toBe(true);
    }
    expect(throttle.check("submit", "origin-a", "BAT_batch1")).toBe(false);
    // A second batch under the same origin is unaffected by the first's cap.
    expect(throttle.check("submit", "origin-a", "BAT_batch2")).toBe(true);
  });

  it("refuses a bucketed action with no actor value rather than pacing nothing", () => {
    const throttle = createPublicThrottle(() => 0);
    expect(throttle.check("allocate", "origin-a")).toBe(false);
    expect(throttle.check("submit", "origin-a")).toBe(false);
  });

  it("shares no budget between actions", () => {
    const throttle = createPublicThrottle(() => 0);
    for (let n = 0; n < 30; n += 1) {
      expect(throttle.check("enroll", "origin-a")).toBe(true);
    }
    expect(throttle.check("enroll", "origin-a")).toBe(false);
    // Exhausting enroll leaves allocate and submit untouched on the same origin.
    expect(throttle.check("allocate", "origin-a", "VAL_actor1")).toBe(true);
    expect(throttle.check("submit", "origin-a", "BAT_batch1")).toBe(true);
    // And the shipped resume budget is untouched too.
    expect(throttle.check("resume", "origin-a", "VAL_actor1")).toBe(true);
  });
});
