import { describe, expect, it } from "vitest";

import { translatorFor } from "@/lib/i18n/copy";
import { decideStartBatch } from "@/lib/validation/start-batch-flow";
import { allocatedEntrySchema, type AllocationOutcome } from "@/schemas/batch";

/**
 * The handoff out of `/ready`: does this participant start, wait, check the question first, or read a
 * failure?
 *
 * =================================================================================================
 * WHY THE `exhausted` BRANCH IS THE ONE THAT MATTERS MOST HERE
 * =================================================================================================
 * `exhausted` is an ORDINARY research outcome — every remaining entry was already answered by this
 * validator, or the pool is spent — and reporting it as a FAILURE would tell someone who has finished
 * the study that something is broken. So it gets its own outcome and its own sentence, and those two
 * facts are asserted separately below, because a single test over the whole switch would pass with
 * `exhausted` folded into `error`.
 */

const t = translatorFor("en");
const STORED_ID = "VAL_0a1b2c3d";

/**
 * One allocated entry, built from `allocatedEntrySchema` rather than written out.
 *
 * `AllocationOutcome`'s `allocated` branch carries `entries`, not a `total`. The first draft of this
 * file wrote `{ status: "allocated", batchId, total: 10 }` in two places and typecheck refused it at
 * `TS2353: 'total' does not exist in type …`. The tests were passing at runtime, which is the point
 * being made: a runtime suite and a type-check are different instruments, and only one of them had
 * noticed the fixture was describing an allocation that cannot exist.
 */
const ALLOCATED: AllocationOutcome = {
  status: "allocated",
  batchId: "batch-1",
  entries: [
    allocatedEntrySchema.parse({
      id: "OD_0001",
      category: "origin_destination",
      instruction: "Pumunta iti Baguio Athletic Bowl.",
      origin: "Baguio",
      destination: "Baguio",
      transitMode: "jeepney",
    }),
  ],
};
const EXHAUSTED: AllocationOutcome = { status: "exhausted" };

function failed(
  reason: "invalid" | "not_configured" | "unknown_validator" | "persistence" | "screening_required",
): AllocationOutcome {
  return { status: "failed", reason };
}

describe("the no-identity check comes first, and unconditionally", () => {
  it("stops a browser that holds no identifier, whatever the server said", () => {
    // Checked first because it is the one thing knowable BEFORE a request is made. Asking the server
    // to allocate for a browser with no identity would produce `unknown_validator` — a server-side
    // restatement of a fact the browser already had.
    for (const outcome of [null, ALLOCATED, EXHAUSTED, failed("unknown_validator")]) {
      expect(decideStartBatch(null, outcome, t), JSON.stringify(outcome)).toEqual({
        kind: "no-identity",
      });
    }
  });

  it("is NOT an error, and carries no failure message", () => {
    // The decision has no `message` member, and a participant who never answered is not broken. A
    // shared shape with `error` would invite a renderer to print an apology.
    const decision = decideStartBatch(null, null, t);

    expect(decision.kind).toBe("no-identity");
    expect(decision).not.toHaveProperty("message");
  });
});

describe("starting a batch", () => {
  it("starts when the server allocated one, and carries the batch id", () => {
    expect(decideStartBatch(STORED_ID, ALLOCATED, t)).toEqual({
      kind: "start",
      batchId: "batch-1",
    });
  });

  it("reports `exhausted` as its OWN outcome, not as a failure", () => {
    // The single most consequential branch here. `exhausted` means the study has nothing left for this
    // validator, which is a successful finish — and folding it into `error` would tell someone who has
    // completed their contribution that something broke.
    const decision = decideStartBatch(STORED_ID, EXHAUSTED, t);

    expect(decision.kind).toBe("exhausted");
    expect(decision).not.toHaveProperty("message");
    expect(decision.kind).not.toBe("error");
  });

  it("reports an error BEFORE any request has run, rather than starting", () => {
    // `null` means no request has happened. Starting would send a participant to a batch id that does
    // not exist.
    const decision = decideStartBatch(STORED_ID, null, t);

    expect(decision.kind).toBe("error");
    expect(decision.kind === "error" && decision.message.length).toBeGreaterThan(10);
  });
});

describe("mapping a refusal to a sentence", () => {
  it("sends a pre-correction attempt without an answer to restart, not to retry", () => {
    // The refusal is deterministic: the profile will still record no answer on
    // the next request, so a retry control could never succeed. The decision is
    // therefore its own kind — restart, with no message and no batch — rather
    // than an error carrying a "try again" sentence.
    for (const locale of ["en", "fil"] as const) {
      const decision = decideStartBatch(
        STORED_ID,
        failed("screening_required"),
        translatorFor(locale),
      );

      expect(decision).toEqual({ kind: "screening_required" });
      expect(decision).not.toHaveProperty("batchId");
      expect(decision).not.toHaveProperty("message");
    }
  });

  it("distinguishes a refusal the participant can do nothing about from one they can", () => {
    const notConfigured = decideStartBatch(STORED_ID, failed("not_configured"), t);
    const invalid = decideStartBatch(STORED_ID, failed("invalid"), t);
    const unknownValidator = decideStartBatch(STORED_ID, failed("unknown_validator"), t);
    const persistence = decideStartBatch(STORED_ID, failed("persistence"), t);

    const messages = [notConfigured, invalid, unknownValidator, persistence].map((decision) =>
      decision.kind === "error" ? decision.message : null,
    );

    // `not_configured` is distinct because "the study is not open" is true and "try again" is not —
    // retrying cannot succeed until a human deploys.
    expect(messages[0]).not.toBe(messages[3]);
    // `invalid` and `unknown_validator` share the "answer the question first" sentence. Both mean the
    // same thing to a participant — this browser's identity is not one the server recognises — and the
    // one action that fixes either is the same. The first draft of this test asserted
    // `unknown_validator === persistence`, which failed against code that is RIGHT: a stale browser is
    // a thing the participant can fix, so it does not belong with "try again in a moment".
    expect(messages[1]).toBe(messages[2]);
    expect(messages[2]).not.toBe(messages[3]);
  });

  it("tells a participant with an unrecognised browser to ANSWER THE QUESTION, not to retry", () => {
    // The browser holds an identifier the server does not recognise — a stale one, or a hand-edited one.
    // "Try again" cannot fix either, and it would send somebody round a loop. The one action that can
    // fix it is answering the screening question.
    const decision = decideStartBatch(STORED_ID, failed("unknown_validator"), t);

    expect(decision.kind === "error" && decision.message).toMatch(/answer the ilocano question/i);
    expect(decision.kind === "error" && decision.message).not.toMatch(/try again/i);
  });

  it("leaks NO deployment detail, table name, or error code into a participant's screen", () => {
    for (const reason of [
      "invalid",
      "not_configured",
      "unknown_validator",
      "persistence",
      "screening_required",
    ] as const) {
      const decision = decideStartBatch(STORED_ID, failed(reason), t);

      expect(
        decision.kind === "error" ? decision.message : "",
        `${reason}: a participant-facing sentence must not name internals`,
      ).not.toMatch(/supabase|postgrest|validators|validation_batches|23505|SQLSTATE/i);
    }
  });

  it("localises every sentence, and neither leaks an identifier", () => {
    const fil = translatorFor("fil");
    for (const reason of [
      "invalid",
      "not_configured",
      "unknown_validator",
      "persistence",
    ] as const) {
      const english = decideStartBatch(STORED_ID, failed(reason), t);
      const filipino = decideStartBatch(STORED_ID, failed(reason), fil);

      expect(filipino.kind).toBe(english.kind);
      expect(filipino.kind === "error" && english.kind === "error").toBe(true);
      if (filipino.kind === "error" && english.kind === "error") {
        expect(filipino.message).not.toBe(english.message);
        expect(filipino.message.length).toBeGreaterThan(10);
        expect(`${filipino.message} ${english.message}`).not.toContain(STORED_ID);
      }
    }
  });

  it("carries the batch id ONLY on the start branch, and never on any other", () => {
    // The batch id embeds the anonymous validator id, so it must not travel with a message that might
    // be logged, echoed, or shown to somebody it does not belong to.
    for (const outcome of [EXHAUSTED, failed("persistence"), failed("screening_required"), null]) {
      const decision = decideStartBatch(STORED_ID, outcome, t);

      expect(decision).not.toHaveProperty("batchId");
    }
    expect(decideStartBatch(STORED_ID, ALLOCATED, t)).toHaveProperty("batchId");
  });

  it("does not require the batch id to be truthy-looking, so a server value is never second-guessed", () => {
    // The id comes from the server and the server's `batchIdSchema` has validated it. A truthiness check
    // here would mean a blank id is treated as "not allocated", replacing a clear failure with a
    // confusing one.
    const outcome: AllocationOutcome = { ...ALLOCATED, batchId: "" };

    expect(decideStartBatch(STORED_ID, outcome, t)).toEqual({ kind: "start", batchId: "" });
  });
});
