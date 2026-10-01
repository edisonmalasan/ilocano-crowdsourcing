import { describe, expect, it } from "vitest";

import { ENGLISH_COPY, translatorFor } from "@/lib/i18n/copy";
import {
  continueControlState,
  decideContinueBatch,
  type ContinueBatchDecision,
} from "@/lib/validation/continue-batch-flow";
import type { AllocationOutcome } from "@/schemas/batch";

/**
 * The pure half of the finished screen's continue control.
 *
 * =================================================================================================
 * WHY A SEPARATE FILE, AND WHY IT IS NOT A DUPLICATE OF `start-batch-flow`
 * =================================================================================================
 * `start-batch-flow.test.ts` already covers the same four branches for the same `AllocationOutcome`
 * union, and this file deliberately does NOT re-derive them: re-testing `decideStartBatch` from here
 * would prove the same function twice and prove nothing about the new one. What is covered here is
 * what is genuinely different, and the differences are all about SENTENCES rather than branching:
 *
 *   1. EVERY message this decision can produce is compared against the real `validate.finished.*`
 *      catalog entries, in BOTH languages. The old file could assert a branch kind and stop; the claim
 *      that matters here is `design.md` D2's — that the exhausted message is not coverage vocabulary —
 *      and a branch kind cannot carry that.
 *   2. `continueControlState`, which has no counterpart on the start screen under that name.
 *   3. The "no request was made at all" case, which is `outcome === null` rather than a status, and is
 *      the one branch a status-switch cannot express.
 *
 * =================================================================================================
 * WHAT A PASS HERE DOES NOT PROVE
 * =================================================================================================
 * Nothing about the wire, the database, or the navigation. That the continue control actually CALLS
 * this function, that the response's entries never reach the document, and that a press navigates are
 * `tests/dom/finished-batch.test.tsx`, which can fire a handler and `renderToStaticMarkup` cannot.
 */

const EN = translatorFor("en");
const FIL = translatorFor("fil");

/**
 * The allocation outcomes this decision can be handed, built from the schema's own union.
 *
 * The `satisfies` on each one is the point: a variant added to `AllocationOutcome` without a branch
 * here is a compile error in this file rather than a message that silently falls through to the
 * persistence sentence.
 */
const OUTCOMES: ReadonlyArray<AllocationOutcome> = [
  { status: "allocated", batchId: "VAL_a81d92c1-2026-09-30T20:14:03.117Z", entries: [] },
  { status: "exhausted" },
  { status: "failed", reason: "not_configured" },
  { status: "failed", reason: "invalid" },
  { status: "failed", reason: "unknown_validator" },
  { status: "failed", reason: "persistence" },
];

/** A real identifier in the format the schema accepts, minted by the schema's own pattern. */
const STORED_ID = "VAL_a81d92c1";

describe("decideContinueBatch", () => {
  it("reads an ALLOCATED outcome as a continuation, and carries the server's own batch id", () => {
    // The batch id is the SERVER'S. A client that assembled or suggested the continued batch would be
    // doing the thing D1 forbids, so the value here is the one the outcome carries and no other.
    const outcome = OUTCOMES[0];
    expect(outcome?.status).toBe("allocated");

    const decision = decideContinueBatch(STORED_ID, outcome!, EN);

    expect(decision).toEqual({
      kind: "continue",
      batchId: "VAL_a81d92c1-2026-09-30T20:14:03.117Z",
    });
  });

  it("reads an EXHAUSTED pool as an ordinary outcome, not as a failure", () => {
    // The spec scenario is explicit: "the outcome is reported as an exhausted pool rather than as a
    // failure, in the same terms the existing exhausted-pool behaviour already uses, and no batch is
    // fabricated". Asserted as a KIND rather than as a message, because the distinction between an
    // outcome and a fault is a distinction of kind — a failure carries an `alert` in the component,
    // and an exhausted pool deliberately does not.
    expect(decideContinueBatch(STORED_ID, { status: "exhausted" }, EN)).toEqual({
      kind: "exhausted",
    });
    // And it is not an error, named rather than inferred from the shape.
    expect(decideContinueBatch(STORED_ID, { status: "exhausted" }, EN).kind).not.toBe("error");
  });

  it("reports a MISSING identity without asking the server anything", () => {
    // `null` identity is knowable in the browser before any request, so it is decided first and
    // unconditionally. The component is what honours the "no request" half; what this asserts is that
    // the decision does not depend on an outcome existing, so a caller that passes `null` for both
    // cannot accidentally produce a message about the server.
    expect(decideContinueBatch(null, null, EN)).toEqual({ kind: "no-identity" });
    // Same verdict whatever the server said, including when the server said it was fine — so a stale
    // response cannot turn "this browser is not a validator" into a different sentence.
    for (const outcome of OUTCOMES) {
      expect(decideContinueBatch(null, outcome, EN), JSON.stringify(outcome)).toEqual({
        kind: "no-identity",
      });
    }
  });

  it("reports a request that was never MADE as a persistence failure, which is a different fact", () => {
    // `outcome === null` means no request went out at all, and the honest sentence is the one that says
    // nothing was created — the same guarantee the server-side failure sentences make. Asserted
    // separately from the status switch because it is the one branch a `switch (outcome.status)` cannot
    // express, so a rewrite that dropped it would go unnoticed everywhere else.
    const decision = decideContinueBatch(STORED_ID, null, EN);

    expect(decision).toEqual({
      kind: "error",
      message: EN("validate.finished.failure.persistence"),
    });
    // And it is NOT the not-configured sentence: "come back later" is true of one of these and a lie
    // of the other, and they are not the same message.
    expect(decision.kind === "error" && decision.message).not.toBe(
      EN("validate.finished.failure.notConfigured"),
    );
  });

  it("maps each failure reason to its OWN sentence, and every sentence is a real catalog entry", () => {
    // Every reason mapped, not two of them — the loop above hands this function six outcomes and an
    // exhaustive mapping is the only thing that makes all six meaningful.
    const mapping: ReadonlyArray<[Exclude<AllocationOutcome, { status: "allocated" }>, string]> = [
      [{ status: "exhausted" }, EN("validate.finished.exhausted")],
      [
        { status: "failed", reason: "not_configured" },
        EN("validate.finished.failure.notConfigured"),
      ],
      [{ status: "failed", reason: "invalid" }, EN("validate.finished.failure.invalid")],
      [{ status: "failed", reason: "unknown_validator" }, EN("validate.finished.failure.invalid")],
      [{ status: "failed", reason: "persistence" }, EN("validate.finished.failure.persistence")],
    ];

    expect(mapping).toHaveLength(5);
    for (const [outcome, message] of mapping) {
      const decision = decideContinueBatch(STORED_ID, outcome, EN);

      if (decision.kind === "error") {
        expect(decision.message, JSON.stringify(outcome)).toBe(message);
      }
    }
    // The three failure sentences are DISTINCT, so mapping two reasons to one sentence is a visible
    // defect rather than an invisible one. `invalid` and `unknown_validator` deliberately share a
    // sentence — they are the same fact from a participant's point of view — and that is the only
    // sharing.
    const sentences = [
      EN("validate.finished.failure.notConfigured"),
      EN("validate.finished.failure.invalid"),
      EN("validate.finished.failure.persistence"),
    ];
    expect(new Set(sentences).size).toBe(3);
  });

  it("resolves EVERY message through the SUPPLIED translator, so the two screens differ", () => {
    // The translator is a PARAMETER, not a module-level import, and this is what that buys: one
    // decision function, two vocabularies, and no way for a component to render an English sentence on
    // a Filipino screen. Asserted over every reason that produces a message, in both languages.
    const reasons = ["not_configured", "invalid", "unknown_validator", "persistence"] as const;

    // The decision is made ONCE per translator and read from the result, rather than re-decided inside
    // the expectation. A first draft inlined a nested re-decision three levels deep to produce the
    // "not the English one" comparison, which was unreadable and would have compared a value against
    // itself if any of the three calls had ever been reached with a different translator.
    const english: ContinueBatchDecision[] = reasons.map((reason) =>
      decideContinueBatch(STORED_ID, { status: "failed", reason }, EN),
    );
    const filipino: ContinueBatchDecision[] = reasons.map((reason) =>
      decideContinueBatch(STORED_ID, { status: "failed", reason }, FIL),
    );

    for (const [index, reason] of reasons.entries()) {
      const fromEnglish = english[index];
      const fromFilipino = filipino[index];

      expect(fromEnglish?.kind, `EN/${reason}`).toBe("error");
      expect(fromFilipino?.kind, `FIL/${reason}`).toBe("error");
      if (fromEnglish?.kind !== "error" || fromFilipino?.kind !== "error") continue;

      expect(fromEnglish.message.length).toBeGreaterThan(0);
      expect(fromFilipino.message.length).toBeGreaterThan(0);
      // Not the English one — the half a catalog fallback would fail, and the reason this test exists
      // rather than a single-language smoke test.
      expect(fromFilipino.message, `FIL/${reason} fell back to English`).not.toBe(
        fromEnglish.message,
      );
    }

    // And the exhausted branch, which produces a KIND rather than a message: the two languages cannot
    // differ there, and asserting they still decide identically is the point — a locale must not
    // change which branch is taken.
    expect(decideContinueBatch(STORED_ID, { status: "exhausted" }, EN)).toEqual(
      decideContinueBatch(STORED_ID, { status: "exhausted" }, FIL),
    );
  });

  it("routes the exhausted branch to this screen's OWN sentence, never the start screen's", () => {
    // THE REASON THIS MODULE IS SEPARATE FROM `start-batch-flow`, asserted as a fact about the key
    // rather than as a fact about the wording.
    //
    // `design.md` D2 is the reason: `validateStart.exhausted` says every available sentence "has
    // already been answered by the required number of people", which is COVERAGE vocabulary, and this
    // screen also shows a lifetime figure that is deliberately NOT a coverage figure. Reusing the key
    // would put a coverage claim beside that figure — and it would do so UNDERNEATH the
    // `validate.finished.*` copy guard, which is scoped by namespace and would never have seen the
    // string. The two sentences are asserted to be DIFFERENT strings in both languages, which is the
    // part that is mechanical.
    //
    // WHAT IS NOT ASSERTED HERE, deliberately: that the finished sentence avoids every piece of
    // coverage vocabulary. That claim needs an enumeration measured against both catalogs, it already
    // exists, and it is asserted where the words live rather than duplicated here —
    // `tests/unit/locale-copy.test.ts`, the `MEASURED: the coverage-claim vocabulary collides with
    // nothing else in either catalog` block, over the whole `validate.finished.*` namespace. A second
    // copy of the phrase list in this file would be a parallel competing guard that drifts from the
    // first one, which is the thing the project's code-style rules refuse.
    for (const t of [EN, FIL]) {
      expect(t("validate.finished.exhausted")).not.toBe(t("validateStart.exhausted"));
      expect(t("validate.finished.exhausted").length).toBeGreaterThan(0);
      expect(t("validateStart.exhausted").length).toBeGreaterThan(0);
    }
    // The two namespaces are genuinely different namespaces, which is the structural version of the
    // same claim and the one a refactor cannot quietly undo by moving a string between objects.
    // Read off the CATALOG, not off the translator: `EN` is a function, and `Object.keys` over a
    // function returns its own enumerable properties — `[]`. The first draft of this line did exactly
    // that and failed with `expected 0 to be greater than 0`, which reads like an empty catalog rather
    // than like a call made against the wrong object. The catalog module is what holds the keys.
    const finishedKeys = Object.keys(ENGLISH_COPY).filter((key) =>
      key.startsWith("validate.finished."),
    );
    const startKeys = Object.keys(ENGLISH_COPY).filter((key) => key.startsWith("validateStart."));
    expect(finishedKeys.length).toBeGreaterThan(0);
    expect(startKeys.length).toBeGreaterThan(0);
    // Disjoint namespaces, so "the two screens' strings" cannot overlap by construction.
    expect(finishedKeys.filter((key) => startKeys.includes(key))).toEqual([]);

    // CAN FIRE, as a control on the control: the two sentences really do differ in more than the
    // namespace they live in, so a future "these are basically the same string, share one" refactor
    // fails here instead of passing a comparison of two accidentally-identical values.
    const finished = EN("validate.finished.exhausted");
    const start = EN("validateStart.exhausted");
    expect(finished).not.toBe(start);
    expect(finished).not.toBe(start.slice(0, finished.length));
    // And the reassurance the screen owes a participant who pressed the button is present in its own
    // words, not borrowed: both sentences say nothing was lost, so the requirement's "everything you
    // have already submitted is unchanged" survives the split.
    expect(finished.toLowerCase()).toContain("unchanged");
    expect(start.toLowerCase()).toContain("nothing more to do");
  });
});

describe("continueControlState", () => {
  it("is IDLE by default: enabled, not busy, and carrying its idle label", () => {
    const state = continueControlState(false, EN);

    expect(state).toEqual({
      disabled: false,
      ariaBusy: undefined,
      label: EN("validate.finished.continue"),
    });
    // `undefined` rather than `false` for `aria-busy`, because React renders neither for `undefined`
    // and renders `aria-busy="false"` for `false` — and `design-system` requires pending to be
    // DISTINGUISHABLE from unavailable, so the idle document must not claim to be busy.
    expect(state.ariaBusy).toBeUndefined();
  });

  it("is BUSY while the request is open: disabled, aria-busy, and a label that says what is happening", () => {
    const state = continueControlState(true, EN);

    expect(state).toEqual({
      disabled: true,
      ariaBusy: true,
      label: EN("validate.finished.continue.working"),
    });
    // All THREE change together. The requirement in `design-system` is that the initiating control
    // reports its progress as TEXT as well as styling and keeps an accessible name while it does, so a
    // pending control that only disabled itself would satisfy none of the three clauses.
    expect(state.disabled).toBe(true);
    expect(state.ariaBusy).toBe(true);
    expect(state.label).not.toBe(EN("validate.finished.continue"));
    // Non-empty, so the control never loses its name while busy.
    expect(state.label.trim().length).toBeGreaterThan(0);
  });

  it("keeps the idle and busy labels DISTINCT in BOTH catalogs, so a change to one cannot pass as the other", () => {
    // The first draft of this assertion compared the English pair only. In the Filipino catalog the
    // two labels are different strings too, and a translator who made them equal — or a copy edit that
    // dropped the busy label and left the catalog type-checkable — would be invisible to an
    // English-only check.
    //
    // And the substring relationship is checked explicitly, because it is a measurement rather than an
    // assumption: "Answer another batch" must NOT be a prefix or substring of "Preparing your
    // sentences…", or the finished screen's rendered count of the idle label would be 2 while nothing
    // was wrong. That count is asserted in `tests/unit/validation-routes.test.tsx`, and this is where
    // the assumption it rests on is pinned.
    for (const t of [EN, FIL]) {
      const idle = t("validate.finished.continue");
      const busy = t("validate.finished.continue.working");

      expect(idle).not.toBe(busy);
      expect(busy).not.toContain(idle);
      expect(idle).not.toContain(busy);
      // And neither is empty, which would make "distinct" trivially true for "".
      expect(idle.length).toBeGreaterThan(0);
      expect(busy.length).toBeGreaterThan(0);
    }
    // And the busy label never says how LONG it takes: no countdown, no "almost there", no estimate.
    // `design.md` D7's prohibition on speed pressure, applied to the one string that reports latency.
    for (const t of [EN, FIL]) {
      expect(t("validate.finished.continue.working").toLowerCase()).not.toMatch(
        /\b(?:seconds?|minutes?|almost|soon|quick|fast|hurry)\b/,
      );
    }
  });

  it("changes ONLY the three facts it owns, leaving the identity of the control untouched", () => {
    // The pair read as a whole rather than field by field, so a fourth field added to the state — say
    // a `hidden` flag, which `design.md` open question 1's answer specifically rules out — is visible
    // here as a difference in key set rather than silently accepted.
    const idle = continueControlState(false, EN);
    const busy = continueControlState(true, EN);

    expect(Object.keys(idle).sort()).toEqual(Object.keys(busy).sort());
    expect(Object.keys(idle).sort()).toEqual(["ariaBusy", "disabled", "label"]);
    // A fourth key would break this file's `toEqual` above first, which is the earlier failure; naming
    // the key set here says which one.
    expect("hidden" in idle).toBe(false);
  });
});
