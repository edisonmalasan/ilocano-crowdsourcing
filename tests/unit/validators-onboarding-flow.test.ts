import { describe, expect, it } from "vitest";

import {
  decideEnrollment,
  decideResume,
  firstActionFor,
  messageForFailure,
  RESUMED_NOTICE,
  submitControlState,
} from "@/lib/validators/onboarding-flow";
import { ILOCANO_PROFICIENCY_CHOICES, type AnonymousValidatorId } from "@/schemas/validator";

/**
 * Onboarding flow decisions.
 *
 * These are the guarantees that keep one person from being recorded as two anonymous
 * validators, so they are asserted as decisions rather than as markup. Every branch
 * here is reachable with no DOM, no network, and no Supabase credential.
 */

const STORED = "VAL_0000abcd" as AnonymousValidatorId;
const MINTED = "VAL_deadbeef" as AnonymousValidatorId;

describe("firstActionFor", () => {
  it("enrolls directly when the browser holds no identity", () => {
    expect(firstActionFor(null)).toBe("enroll");
  });

  it("resolves a stored identity before enrolling when one exists", () => {
    // The ordering IS the guarantee: a second identity for one person would split their
    // research record in two with nothing in the data able to tell.
    expect(firstActionFor(STORED)).toBe("resume");
  });
});

describe("decideEnrollment", () => {
  it("carries a newly minted identifier so the browser can store it", () => {
    expect(decideEnrollment({ status: "enrolled", validatorId: MINTED })).toEqual({
      kind: "ready",
      validatorId: MINTED,
    });
  });

  it.each(["not_configured", "invalid", "persistence"] as const)(
    "reports a %s failure as an error and yields no identifier",
    (reason) => {
      const decision = decideEnrollment({ status: "failed", reason });

      expect(decision.kind).toBe("error");
      expect(decision).not.toHaveProperty("validatorId");
      expect(JSON.stringify(decision)).not.toMatch(/VAL_/);
    },
  );

  it("gives a missing database different words from a genuine write failure", () => {
    const notConfigured = decideEnrollment({ status: "failed", reason: "not_configured" });
    const persistence = decideEnrollment({ status: "failed", reason: "persistence" });

    if (notConfigured.kind !== "error" || persistence.kind !== "error") {
      throw new Error("expected two error decisions");
    }
    expect(notConfigured.message).not.toBe(persistence.message);
    expect(notConfigured.message).toMatch(/not open/i);
  });

  it("never reports an identifier for a failed enrollment, so none can be stored", () => {
    for (const reason of ["not_configured", "invalid", "persistence"] as const) {
      expect(decideEnrollment({ status: "failed", reason })).not.toHaveProperty("validatorId");
    }
  });

  it("tells the participant nothing was saved, so a failure is safe to retry", () => {
    for (const reason of ["not_configured", "invalid", "persistence"] as const) {
      for (const subject of ["enrollment", "resume"] as const) {
        // A participant who cannot tell whether a failure persisted something will
        // either assume the worst or retry and create a duplicate.
        expect(messageForFailure(reason, subject)).toMatch(
          /nothing was saved|nothing was changed/i,
        );
      }
    }
  });

  it("never tells someone to pick a screening option in response to a resume failure", () => {
    // The wording bug this guards: one shared string made the resume path ask a
    // participant to choose a proficiency level, which the resume path has no way to
    // collect. It is not reachable in normal use, but it is reachable per the type.
    for (const reason of ["not_configured", "invalid", "persistence"] as const) {
      expect(messageForFailure(reason, "resume")).not.toMatch(/pick one of the options/i);
    }
  });

  it("gives the two subjects genuinely different copy", () => {
    for (const reason of ["not_configured", "invalid", "persistence"] as const) {
      expect(messageForFailure(reason, "enrollment")).not.toBe(messageForFailure(reason, "resume"));
    }
  });

  it("leaks no credential, variable name, host, or table in any message", () => {
    for (const reason of ["not_configured", "invalid", "persistence"] as const) {
      for (const subject of ["enrollment", "resume"] as const) {
        expect(messageForFailure(reason, subject)).not.toMatch(
          /SUPABASE|service_role|https?:\/\/|\.ts|stack|Error:|validators/i,
        );
      }
    }
  });
});

describe("decideResume", () => {
  it("reports a restored validator as ready with no identifier to store", () => {
    // `validatorId: null` is meaningful, not a gap: the browser already holds it, and
    // re-storing it would be a redundant write.
    expect(decideResume({ status: "restored", validatorId: STORED }, "fluent")).toEqual({
      kind: "ready",
      validatorId: null,
    });
  });

  it("treats an unrecognised identifier as a fresh enrollment rather than an error", () => {
    // A stale local-storage value is the most likely thing to go wrong on a returning
    // visit. It must never present to the participant as a failure they caused.
    expect(decideResume({ status: "absent" }, "fluent").kind).toBe("enroll-fresh");
  });

  // ---------------------------------------------------------------------------------
  // REGRESSION TEST. This is a real data-integrity bug that shipped in the first
  // revision of this flow and was found by independent review, not by a test.
  //
  // `decideResume` used to take only the result and return `{ kind: "enroll-fresh",
  // answer: null }` — a hardcoded null. The component then forwarded `decision.answer`
  // into the enrollment. Net effect: a participant who selected "Fluent" on /start and
  // whose stored identifier turned out to name nobody was enrolled as having DECLINED.
  // Their research datum was silently replaced by a different one.
  //
  // The bug survived because the code carried an `answer` field on `enroll-fresh` with a
  // comment explaining that it existed so "a caller reaching it with a different answer
  // must not have to re-derive the rule" — and the only producer of that field
  // hardcoded null. A documented field that is always null reads as though something
  // is using it.
  // ---------------------------------------------------------------------------------
  it("carries the participant's actual answer through the stale-identifier fallback", () => {
    // The whole point, asserted directly: every approved value, not just one.
    for (const choice of ILOCANO_PROFICIENCY_CHOICES) {
      const decision = decideResume({ status: "absent" }, choice.value);

      expect(decision).toEqual({ kind: "enroll-fresh", answer: choice.value });
      // And specifically: not null, which is what enrolled people as having declined.
      if (decision.kind !== "enroll-fresh") throw new Error("expected enroll-fresh");
      expect(decision.answer).not.toBeNull();
    }
  });

  it("still records a genuine decline as a decline", () => {
    // The fix must not have turned "declined" into "never null", which would fabricate
    // an answer for someone who chose to skip.
    expect(decideResume({ status: "absent" }, null)).toEqual({
      kind: "enroll-fresh",
      answer: null,
    });
  });

  it.each(["not_configured", "invalid", "persistence"] as const)(
    "reports a %s resume failure as an error rather than enrolling",
    (reason) => {
      // The important half: a resume that FAILED must not silently fall through to
      // enrolling, which is exactly how a person ends up with two identities.
      expect(decideResume({ status: "failed", reason }, "fluent").kind).toBe("error");
    },
  );

  it("never reports a resume failure as a fresh enrollment", () => {
    for (const reason of ["not_configured", "invalid", "persistence"] as const) {
      expect(decideResume({ status: "failed", reason }, "fluent").kind).not.toBe("enroll-fresh");
    }
  });

  it("discards the pending answer when a resume succeeds, so the original is preserved", () => {
    // A restore must not write. There is no `create` call on this path, so the stored
    // self-reported answer survives untouched — which is the actual requirement, and
    // the reason a selection typed on /start by a returning validator is not stored.
    const decision = decideResume({ status: "restored", validatorId: STORED }, "fluent");

    expect(decision.kind).toBe("ready");
    expect(decision).not.toHaveProperty("answer");
  });
});

describe("the resume-then-enroll guarantee", () => {
  it("produces no identifier a caller could store when a resume fails", () => {
    // Combined with `firstActionFor`, this is the property that matters: a stored
    // identity is only ever overwritten after the server has confirmed it names nobody.
    for (const reason of ["not_configured", "invalid", "persistence"] as const) {
      const decision = decideResume({ status: "failed", reason }, "fluent");
      expect(decision).not.toHaveProperty("validatorId");
    }
  });

  it("disables the submit control while a Server Action is in flight", () => {
    // A control that stays clickable mid-write is how one participant ends up with two
    // identities, because `disabled={isPending}` is the only thing between a double
    // activation and two `create` calls.
    const state = submitControlState(true);

    expect(state.disabled).toBe(true);
    expect(state.ariaBusy).toBe(true);
    expect(state.label).not.toBe("Continue");
  });

  it("leaves the control ready and unannounced when idle", () => {
    const state = submitControlState(false);

    expect(state.disabled).toBe(false);
    // `undefined` rather than `false`, so the attribute is absent rather than
    // `aria-busy="false"` on a control that is simply ready.
    expect(state.ariaBusy).toBeUndefined();
    expect(state.label).toBe("Continue");
  });

  it("announces a resume so a participant knows they were not issued a new identity", () => {
    expect(RESUMED_NOTICE).toMatch(/already held/i);
    // And it must not read as though something new was created.
    expect(RESUMED_NOTICE).not.toMatch(/new validator|created|signed up/i);
  });
});
