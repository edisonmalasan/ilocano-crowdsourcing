import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, back: () => {} }),
}));

/**
 * The stale-timer guard, pinned where it lives.
 *
 * Spec scenario "A stale timer reveals nothing": a transition timer from an
 * older submit firing after a newer transition has begun changes nothing.
 * Through the component's public behavior two live timers cannot coexist
 * (one timer keyed on a monotonic id, cleared on every key change, and no
 * form to submit from mid-transition), so no DOM test can produce the
 * interleaving — and an untestable guard is a comment. The expiry decision
 * is therefore a pure exported predicate, asserted here, while the T-suite
 * pins the wiring (one timer per transition, cleanup on unmount, full
 * interval per entry). A mutation that drops the id check turns this file
 * red while the DOM suite stays green, which is exactly the gap it closes.
 */
let transitionTimerIsCurrent!: (
  current: import("@/app/validate/[batchId]/validation-session").PendingTransition | null,
  timerKey: number | null,
) => boolean;

beforeAll(async () => {
  ({ transitionTimerIsCurrent } = await import("@/app/validate/[batchId]/validation-session"));
});

describe("transitionTimerIsCurrent", () => {
  it("expires the transition its timer was started for", () => {
    expect(transitionTimerIsCurrent({ id: 1, next: null, expired: false }, 1)).toBe(true);
  });

  it("refuses a stale timer: older id against a newer transition changes nothing", () => {
    expect(transitionTimerIsCurrent({ id: 2, next: null, expired: false }, 1)).toBe(false);
  });

  it("refuses a newer timer against an older transition, the mirror direction", () => {
    expect(transitionTimerIsCurrent({ id: 1, next: null, expired: false }, 2)).toBe(false);
  });

  it("does nothing without a live transition or a running timer", () => {
    expect(transitionTimerIsCurrent(null, 1)).toBe(false);
    expect(transitionTimerIsCurrent({ id: 1, next: null, expired: false }, null)).toBe(false);
    expect(transitionTimerIsCurrent(null, null)).toBe(false);
  });

  it("decides by id value, not by object identity or expiry", () => {
    // Expiry gating lives in the timer key (null once expired), not here: an
    // already-expired transition with a matching key is still "current".
    expect(transitionTimerIsCurrent({ id: 1, next: null, expired: true }, 1)).toBe(true);
    // And a filled-in next entry does not change whose timer this is.
    expect(
      transitionTimerIsCurrent(
        {
          id: 1,
          next: {
            entry: {
              id: "OD_0002",
              category: "origin_destination",
              instruction: "Instruction sentence for OD_0002.",
              origin: null,
              destination: "Destination 2",
              transitMode: null,
            },
            position: 2,
            total: 3,
            completedCount: 1,
          },
          expired: false,
        },
        1,
      ),
    ).toBe(true);
  });
});
