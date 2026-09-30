import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Source-level assertions on the screening form's wiring.
 *
 * =============================================================================
 * WHY THIS FILE EXISTS, and what it is worth
 * =============================================================================
 * The flow DECISIONS are pure and exhaustively unit-tested. The COMPONENT that applies
 * them is not directly testable in this project: there is no browser test runner, and
 * `renderToStaticMarkup` runs no click handlers and starts no transitions, so a
 * component can only be observed in its initial idle state.
 *
 * That gap is not hypothetical. An independent review found that `decideResume` was
 * called with a hardcoded `null` and the participant's answer was discarded — and the
 * pure-function tests were all green, because they were green about the DECISION and
 * silent about the CALL. Comparing a function to itself, and testing a pure function
 * while leaving its only call site unexamined, are the same mistake in different clothes.
 *
 * So the wiring is asserted against the source text. This is strictly weaker than a
 * behavioural test: it proves a string is or is not present, not that the code does what
 * the string suggests. It is here because it is the stronger of the two options
 * available without a DOM, and because a check that would have caught the bug found is
 * better than no check. It is NOT a substitute for a browser test, and a change that
 * renames these identifiers will fail here for cosmetic reasons.
 *
 * The same pattern is used in `validators-actions.test.ts` for the write-intake boundary,
 * where the import path is asserted to contain no filesystem write.
 */

const FORM_PATH = "src/app/start/screening-form.tsx";
const RESUME_COMPONENT_PATH = "src/components/onboarding/resume-validator.tsx";

function read(file: string): string {
  return readFileSync(file, "utf8");
}

/** Strips comments, so a rule stated in prose cannot satisfy a rule about the code. */
function code(file: string): string {
  return read(file)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/\/\/.*$/gm, " ");
}

describe("the screening form passes the participant's answer to the decision", () => {
  it("does not hand `decideResume` a literal null", () => {
    // The exact defect: `decideResume(result, null)` enrolls the participant as having
    // declined, discarding the answer they just gave.
    expect(code(FORM_PATH)).not.toMatch(/decideResume\([^)]*,\s*null\s*\)/);
  });

  it("passes the submit argument through to `decideResume`", () => {
    const source = code(FORM_PATH);

    // The second argument must be the answer in scope, not a literal of any kind.
    expect(source).toMatch(/decideResume\([\s\S]*?,\s*answer\s*\)/);
  });

  it("enrolls with the same answer on the stale-identifier fallback", () => {
    const source = code(FORM_PATH);

    // `enroll(null)` here would reintroduce the discarded answer behind a different
    // spelling, which the previous assertion above would not catch.
    expect(source).not.toMatch(/enroll\(\s*null\s*\)/);
    expect(source).toMatch(/await enroll\(answer\)/);
  });
});

describe("the screening form awaits every write", () => {
  it("contains no fire-and-forget enrollment", () => {
    // `void enroll(...)` lets `isPending` return to false while the second Server Action
    // round trip is still in flight. Two activations inside that window mint two
    // validators, and the second silently overwrites the first in localStorage — the
    // exact split the resume-before-enroll ordering exists to prevent.
    expect(code(FORM_PATH)).not.toMatch(/void\s+enroll\(/);
  });

  it("has no unawaited call to either Server Action", () => {
    const source = code(FORM_PATH);

    // No `void` and no bare floating call: every action result is consumed.
    expect(source).not.toMatch(/void\s+(enrollValidatorAction|resumeValidatorAction)/);
    expect(source).toMatch(/await enrollValidatorAction\(/);
    expect(source).toMatch(/await resumeValidatorAction\(/);
  });

  it("routes the whole flow through a single submit function", () => {
    // Two independent write paths would be two places for the pending state to be
    // forgotten. One entry point, awaited throughout.
    const source = code(FORM_PATH);
    const writeCalls = source.match(/enrollValidatorAction\(|resumeValidatorAction\(/g) ?? [];

    // One call site each, both inside functions that are awaited by `submit`.
    expect(writeCalls.filter((c) => c.startsWith("enroll"))).toHaveLength(1);
    expect(writeCalls.filter((c) => c.startsWith("resume"))).toHaveLength(1);
  });
});

describe("the server still has no access to browser storage", () => {
  it("the screening form does not reach `globalThis` or a storage key directly", () => {
    const source = code(FORM_PATH);

    // All browser-storage access goes through `browser-identity`, so the one key this
    // project writes is provably the only one.
    expect(source).not.toMatch(/globalThis\./);
    expect(source).not.toMatch(/localStorage/);
    expect(source).not.toMatch(/sessionStorage/);
    expect(source).toMatch(/readStoredValidatorId|writeStoredValidatorId|clearStoredValidatorId/);
  });

  it("the resume component does not reach `globalThis` either", () => {
    expect(code(RESUME_COMPONENT_PATH)).not.toMatch(/globalThis\./);
  });
});

describe("the resume component never enrolls", () => {
  it("does not import the enrollment action at all", () => {
    // The landing page must not be able to create a validator. If it could, a first-time
    // visitor pressing the wrong button would be enrolled, and `enroll-fresh` would
    // silently become "enroll" on a route that collects no screening answer.
    const source = code(RESUME_COMPONENT_PATH);

    expect(source).not.toMatch(/enrollValidatorAction/);
    expect(source).toMatch(/resumeValidatorAction/);
  });

  it("passes null as the answer, because that route collects none", () => {
    // Explicit, and asserted: `null` here is correct (no question was asked), unlike the
    // screening form where `null` would be a discarded answer.
    expect(code(RESUME_COMPONENT_PATH)).toMatch(/decideResume\([\s\S]*?,\s*null\s*\)/);
  });
});
