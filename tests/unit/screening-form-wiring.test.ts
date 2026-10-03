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
const ACTIONS_CORE_PATH = "src/lib/validators/onboarding-actions-core.ts";

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

/**
 * The top-level arguments of the FIRST call to `name(...)` in `source`, or `null` if there is none.
 *
 * ============================== WHY THIS EXISTS ==============================
 * These two assertions used to be regular expressions over the call site, and both of them broke
 * the moment `decideResume` gained a third parameter - the translator. Neither regex was wrong
 * about the rule; each was coupled to the call having exactly as many arguments as it had when it
 * was written, which is a cosmetic coupling, and a cosmetic coupling in a guard is the thing this
 * file's own header warns about: a check that fails for the wrong reason is a check people learn
 * to "fix" by deleting.
 *
 * Splitting on top-level commas states the rule directly - "the SECOND argument is `answer`" -
 * and keeps stating it when the signature changes for an unrelated reason. That is strictly
 * stronger than the regex it replaces: the regex could not have told an `answer` in first position
 * from one in second, and this can.
 *
 * KNOWN LIMIT, stated because a silent one would be worse: the depth counter treats `{`, `[` and
 * `(` uniformly and does not understand template literals or regex literals, so an unbalanced
 * bracket inside a backtick string would truncate the argument list. None of the calls inspected
 * here contain one, and a truncated list fails the assertions below loudly rather than passing
 * them, so the failure mode is a red test and not a false green.
 */
function callArguments(source: string, name: string): string[] | null {
  const start = source.indexOf(`${name}(`);
  if (start === -1) {
    return null;
  }

  const args: string[] = [];
  let current = "";
  let depth = 0;

  for (let index = start + name.length + 1; index < source.length; index += 1) {
    const character = source[index];

    if ("([{".includes(character)) {
      depth += 1;
    } else if (")]}".includes(character)) {
      if (depth === 0) {
        args.push(current.trim());
        return args;
      }
      depth -= 1;
    } else if (character === "," && depth === 0) {
      args.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  // Unbalanced brackets: the call never closed. Returning the arguments found so far would let a
  // truncated read masquerade as a complete one, so this is reported as "not found" instead.
  return null;
}

describe("the screening form passes the participant's answer to the decision", () => {
  it("does not hand `decideResume` a literal null", () => {
    // The exact defect: `decideResume(result, null)` enrolls the participant as having
    // declined, discarding the answer they just gave.
    //
    // The pattern allows NESTED parentheses and newlines between the call and the argument.
    // An earlier version of this assertion used `[^)]*`, which cannot cross the `)` that
    // closes `resumeValidatorAction(...)` - so it could never match the real call site and
    // was dead code. It was caught by restoring the exact defect and observing that the test
    // named after the defect stayed green while a different one went red. A dead assertion
    // is worse than a missing one, because it appears in a coverage table as evidence.
    expect(code(FORM_PATH)).not.toMatch(/decideResume\((?:[^()]|\([^()]*\))*?,\s*null\s*\)/);
  });

  it("passes the submit argument through to `decideResume`", () => {
    // The SECOND argument must be the answer in scope, not a literal of any kind. Stated by
    // position rather than by pattern, so it keeps holding when the signature gains an
    // unrelated parameter - which is exactly what broke the regex this replaced.
    const args = callArguments(code(FORM_PATH), "decideResume");

    expect(args, "no `decideResume` call found in the screening form").not.toBeNull();
    expect(args?.[1]).toBe("answer");
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
    //
    // SCOPE, STATED BECAUSE IT IS THE WHOLE POINT OF THE THREE `not.toMatch` LINES BELOW:
    // this is a COMPONENT-scoped assertion over a LIST of storage names, and it has always been
    // both. `tests/unit/guard-weakness.ts` recorded the defect this change discharged — the list
    // is not a definition, so `indexedDB` or `document.cookie` passed it — and the closed-set
    // claim now lives in `tests/unit/attempt-storage-enumeration.test.ts`, which is rooted at all
    // of `src/` rather than at this one file and whose scanner separates code from prose so that
    // the correct comments in this repository do not trip it.
    //
    // What is left here is the part that is specifically about THIS component and worth naming in
    // place: it must reach storage only through the three helpers. That is a claim about which
    // names appear, which is what a list is good at, and it is why this test was kept rather than
    // deleted. Do not widen it into a general storage guard — that is the file that already tried,
    // and widening it is how a component-scoped assertion becomes a guard that reads as total.
    expect(source).not.toMatch(/globalThis\./);
    expect(source).not.toMatch(/localStorage/);
    expect(source).not.toMatch(/sessionStorage/);
    expect(source).toMatch(/readStoredValidatorId/);
    expect(source).toMatch(/writeStoredValidatorId/);
    expect(source).toMatch(/clearStoredValidatorId/);
  });

  it("persists the minted identifier, and does so only from a real one", () => {
    // The previous version of the line above asserted an ALTERNATION of the three
    // storage helpers, which reads as though the write is covered and is not: deleting
    // `writeStoredValidatorId(decision.validatorId)` entirely still matches
    // `readStoredValidatorId`. An alternation asserts that one of several names appears;
    // it says nothing about which, and for a research-data write that distinction is the
    // whole content of the requirement.
    //
    // Deleting the write is the defect that matters. With no identifier stored, every
    // later resume in that browser fails closed into `enroll-fresh`, so one person is
    // enrolled twice and their record is split in two — which is precisely what the
    // resume path exists to prevent. Third-round review confirmed this mutation left all
    // 498 tests green.
    const source = code(FORM_PATH);

    // The write takes its value from the decision's identifier, never from local state
    // and never from the participant's input.
    expect(source).toMatch(/writeStoredValidatorId\(\s*\w+\.validatorId\s*\)/);

    // ...and it happens UNCONDITIONALLY. The match above proves the call is present, which
    // is not the same as proving it always runs. Round four made it conditional:
    // `if (selection !== null) writeStoredValidatorId(decision.validatorId);`. Typecheck
    // exit 0, all 506 tests green - and every participant who used "Skip and continue" was
    // enrolled with no stored identifier, so every later visit failed closed into
    // `enroll-fresh` and minted a SECOND identity. Same data loss as deleting the write,
    // reached by a different route, so the same guard has to close both.
    //
    // Asserted as a whole-statement match on its own line, so a leading `if (...)` fails it.
    const writeLines = code(FORM_PATH)
      .split("\n")
      .filter((line) => line.includes("writeStoredValidatorId("));
    expect(writeLines).toHaveLength(1);
    expect(
      writeLines[0].trim(),
      "the identifier write must be an unconditional statement, not a conditional one",
    ).toBe("writeStoredValidatorId(decision.validatorId);");

    // The server owns the identifier: nothing in this file may mint one. If the client
    // could choose its own identifier, a participant could collide with or impersonate
    // another by picking the value.
    expect(source).not.toMatch(/VAL_/);
    expect(source).not.toMatch(/createAnonymousValidatorId/);
  });

  it("the resume component does not reach `globalThis` either", () => {
    expect(code(RESUME_COMPONENT_PATH)).not.toMatch(/globalThis\./);
  });
});

describe("the resume path performs no write, anywhere", () => {
  // This is the single most important invariant in the change, and it was guarded by
  // PROSE only: `screening-form.tsx` says in a comment that "the resume path contains no
  // `create` call", and `tasks.md` listed the answer "reaches the enrollment write" as
  // red-confirmed. Third-round review added `validators.create(...)` to the `restored`
  // branch and got typecheck exit 0 with all 498 tests passing.
  //
  // What that mutation would do: a returning validator's screening answer is overwritten
  // by whatever they just selected, or the record is replaced outright, and nothing in
  // the system can tell afterwards. The guarantee is load-bearing and it was unasserted.

  it("the restored branch of the action core returns only, and creates nothing", () => {
    // Scoped to the `restored` arm specifically. Asserting the whole file contains no
    // `create` would be wrong — `enrollValidatorAction` legitimately calls it.
    const source = code(ACTIONS_CORE_PATH);

    const restored = source.slice(source.indexOf('outcome.status === "restored"'));
    expect(restored, "the restored branch is no longer shaped as expected").toContain(
      "validatorId",
    );

    // No repository mutation of any kind on the restored path.
    expect(restored).not.toMatch(/validators\.create/);
    expect(restored).not.toMatch(/\.create\(/);
    expect(restored).not.toMatch(/enroll/);
  });

  it("a restored validator is applied and the function returns, never enrolling again", () => {
    // Deleting the early-return branch leaves a restored validator falling through to the
    // stale-identifier fallback: the identifier is cleared and a SECOND validator is
    // created for one person. Third-round review confirmed this mutation left all 498
    // tests green. Nothing below the decision could catch it, because the damage happens
    // in the branch that was deleted.
    const source = code(FORM_PATH);

    const restoredAt = source.indexOf('decision.kind !== "enroll-fresh"');
    expect(restoredAt, "the restored branch no longer guards on enroll-fresh").toBeGreaterThan(-1);

    // Both halves of the branch are required, and in this window. Removing the `return`
    // while keeping the `apply` still falls through, so asserting only `apply` would be
    // half a guard - which is what the earlier alternation was.
    const block = source.slice(restoredAt, restoredAt + 200);
    expect(block).toMatch(/apply\(decision\)/);
    expect(block, "the restored branch applies the decision but does not return").toMatch(
      /\breturn\b/,
    );

    // The stale-identifier fallback must come after the restored branch, never before.
    const clearAt = source.indexOf("clearStoredValidatorId()");
    expect(clearAt).toBeGreaterThan(restoredAt);

    // Exactly two enrollment sites - no stored identifier, and an unrecognised one - and
    // both must pass the participant's own answer through. A third site would mean some
    // path can enroll without a decision at all.
    expect(source.match(/await enroll\(/g)).toHaveLength(2);
    expect(source.match(/await enroll\(answer\)/g)).toHaveLength(2);
  });

  it("the whole resume action touches the repository read-only", () => {
    // Broader floor under the same invariant: across the entire resume action there is
    // no write of any kind, whatever the branch structure turns out to be. This is the
    // assertion that survives someone restructuring the `restored` ternary.
    const source = code(ACTIONS_CORE_PATH);
    const resumeStart = source.indexOf("export async function runResume");
    expect(resumeStart, "runResume is no longer an exported function").toBeGreaterThan(-1);

    const resumeBody = source.slice(resumeStart);
    // Cut at the next top-level export, so a later action's writes cannot satisfy or
    // pollute this.
    const nextExport = resumeBody.indexOf("\nexport ", 10);
    const scope = nextExport === -1 ? resumeBody : resumeBody.slice(0, nextExport);

    // The action's whole job is to validate the intent, delegate to the resume service,
    // and shape the outcome. It reads the stored identifier and it reads nothing else.
    // (It does not call `findById` itself - the service does - so asserting that here
    // would have pinned the wrong contract and would break on a harmless refactor.)
    expect(scope).toMatch(/resumeValidator\(/);
    expect(scope).toMatch(/anonymousValidatorIdSchema/);
    expect(scope).not.toMatch(/\.create\(|\.update\(|\.delete\(|\.upsert\(/);
  });
});

describe("the form refuses an empty submit and never fabricates an answer", () => {
  it("a single submit control guards on the selection, and no approved level appears near it", () => {
    // With no selection there is nothing to submit, so the missing answer must
    // be identified on the control and NO request may begin. Silently writing
    // any real proficiency level here — or submitting a null decline — is
    // fabricated research metadata, and it is a mutation that typechecks and
    // lints cleanly because every approved value is a legal argument.
    //
    // Third-round review confirmed `run("conversational")` on the old skip
    // handler left the suite green. The consequence would be invisible in the
    // data: the record would simply claim a screening answer the participant
    // never chose.
    const source = code(FORM_PATH);

    // Exactly one submit control. A second affordance submitting without a
    // selection is the shape the skip button used to have.
    expect(source.match(/type="submit"/g)).toHaveLength(1);
    expect(source).not.toMatch(/run\(null\)/);

    // The empty case is refused on the form with the field-attached message,
    // before any transition begins.
    expect(source).toMatch(/if \(selection === null\)/);
    expect(source).toMatch(/setError\(t\("screening\.failure\.invalid\.enroll"\)\)/);

    // Belt and braces: no proficiency LEVEL may appear as a literal ANYWHERE in
    // the component. `run` now takes no argument at all, so a literal level at
    // any call site is fabrication.
    //
    // The first version of this assertion anchored on `(`: `\(\s*["']fluent["']`. It passed
    // the D1 probe because `run("conversational")` happens to have that exact shape, and it
    // is narrower than its own comment claimed. Round four found the gap by writing
    // `run(selection ?? "fluent")` - a participant who pressed Continue without choosing
    // anything was enrolled as Fluent, fabricated research data, and the whole 506-test suite
    // stayed green. The anchor was the whole problem: requiring the literal to sit
    // immediately after an open paren means any other route to the same value passes.
    //
    // So the assertion no longer looks for a shape at all. No approved level may occur as a
    // string literal in this component, in any argument position, in any expression. That is
    // a stronger claim than the one the comment used to make, and it is now the one the
    // comment makes.
    const levels = ["native", "fluent", "conversational", "basic", "not_confident"];
    for (const level of levels) {
      expect(source, `a literal "${level}" appears somewhere in the screening form`).not.toMatch(
        new RegExp(`["'\`]${level}["'\`]`),
      );
    }

    // And the participant's own selection is what reaches `submit`, unmodified. This is the
    // specific mutation round four used, asserted directly so the failure names itself.
    expect(source).toMatch(/await submit\(answer\)/);
    expect(source).not.toMatch(/submit\(\s*\w+\s*(\?\?|\|\|)/);
  });
});

describe("a rejected submission reaches the field", () => {
  it("the error state is forwarded to the control, not just held in state", () => {
    // Holding `error` in state and never passing it down is the shape of a silent
    // failure: the participant presses submit, nothing happens, and nothing explains
    // why. `AnswerGroup` renders `role="alert"`, `aria-invalid`, and `aria-describedby`
    // — all of it invisible unless the call site actually forwards the value.
    // Third-round review confirmed `error={undefined}` left the suite green.
    const source = code(FORM_PATH);

    expect(source).toMatch(/error=\{[^}]*\berror\b[^}]*\}/);

    // Forwarding is necessary and NOT sufficient. The forwarded value must actually be
    // POPULATED on the failure path. Round four changed `setError(decision.message)` to
    // `setError(null)`: typecheck exit 0, 506 tests green, and a rejected submission
    // rendered nothing at all - the participant pressed Continue, the action failed, no
    // message appeared, and the form simply sat there. That is exactly the silent failure
    // the forwarding assertion's own comment describes, one step further from where the
    // assertion was looking.
    expect(source).toMatch(/setError\(decision\.message\)/);
  });
});

describe("the resume component's promises are backed by its calls", () => {
  // Round five opened this file for the first time across five review rounds, and found
  // that one of its participant-facing strings asserts a side effect nothing guards.
  //
  // MESSAGES.unknown reads "That saved identity is no longer recognised, so it has been
  // cleared." The clear is at L84. Deleting it is caught, but making it CONDITIONAL is
  // not - `if (answer === null) clearStoredValidatorId();` passes the bare-name check
  // while the stale identifier survives. The participant is then told it was cleared, and
  // it is still there, so every later visit silently re-enrols them a second time.
  //
  // This is the same shape as the form's C3: round three closed "delete the write", and
  // round five found "write only sometimes" reaches the same data loss by another route.
  // Both are now whole-statement matches, so a leading `if (...)` fails them.
  it("clears the stale identifier unconditionally on the path that claims it did", () => {
    const source = code(RESUME_COMPONENT_PATH);

    const clearLines = source
      .split("\n")
      .filter((line) => line.includes("clearStoredValidatorId("));
    expect(clearLines).toHaveLength(1);
    expect(
      clearLines[0].trim(),
      "the clear must be an unconditional statement, not a conditional one",
    ).toBe("clearStoredValidatorId();");

    // The message that makes the claim is set on the very next statement, so the claim
    // and the call cannot drift apart silently. The message arrives as the decision's own
    // notice (which names the unknown identity through the catalog), rather than as a
    // literal here — a literal string could not be checked against the catalog, and a
    // fabricated proficiency level in particular would be invisible.
    const clearAt = source.indexOf("clearStoredValidatorId();");
    const messageAt = source.indexOf("setMessage(decision.message);");
    expect(clearAt).toBeGreaterThan(-1);
    expect(messageAt).toBeGreaterThan(clearAt);
    expect(messageAt - clearAt).toBeLessThan(120);
  });

  it("reports a failed resume rather than swallowing it", () => {
    // The round-four C2, in the file round four never opened. `setMessage(null)` on the
    // failure path typechecks and lints cleanly and leaves the participant pressing a
    // button that does nothing, with no explanation. The same defect, unguarded twice.
    const source = code(RESUME_COMPONENT_PATH);

    expect(source).toMatch(/setMessage\(decision\.message\)/);
    // The success and decline messages are named constants, so a fabricated proficiency
    // level cannot be introduced by a literal here either.
    for (const level of ["native", "fluent", "conversational", "basic", "not_confident"]) {
      expect(source, `a literal "${level}" appears in the resume component`).not.toMatch(
        new RegExp(`["'\`]${level}["'\`]`),
      );
    }
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
    // screening form where `null` would be a discarded answer. Stated by argument position for
    // the same reason as the screening form's counterpart above.
    const args = callArguments(code(RESUME_COMPONENT_PATH), "decideResume");

    expect(args, "no `decideResume` call found in the resume component").not.toBeNull();
    expect(args?.[1]).toBe("null");
  });
});
