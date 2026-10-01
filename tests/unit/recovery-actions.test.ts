import { describe, expect, it, vi } from "vitest";

import {
  runRecoveryLookup,
  recoveryIntentSchema,
  RecoveryIntentKeysAreIdentifierOnly,
  type RecoveryActionDependencies,
  type RecoveryIntent,
} from "@/lib/validation/recovery-actions-core";

/**
 * The recovery intent's key set is closed at the TYPE layer, and this line is what closes it.
 *
 * ── WHY THE ASSERTION SITE IS HERE AND NOT IN `src/` ────────────────────────────────────────────────────
 * `RecoveryIntentKeysAreIdentifierOnly` is an exported alias in `recovery-actions-core.ts` and it
 * constrained **nothing**. An alias with no assertion site is never evaluated by the compiler: TypeScript
 * only checks a conditional type where it is *used*, so a declaration nobody names is decoration. Measured
 * before this repair: adding a Zod optional key to `recoveryIntentSchema` left `tsc --noEmit` at **exit
 * 0**, and deleting the alias changed nothing, so the alias and its absence were indistinguishable.
 *
 * Two ledgers advertised the opposite — `docs/ROADMAP.md`'s Lifecycle-state row and the `test:unit` row of
 * `AGENTS.md` both claimed these pins "make a fourth offer field or a second recovery-intent key fail
 * `typecheck`". **A claim of enforcement that does not enforce is worse than no claim**, because a reader
 * weighs `typecheck` as evidence. So the pin is given an assertion site here, and this is the comment that
 * says what it is worth.
 *
 * ── WHAT IT IS WORTH, STATED PLAINLY ───────────────────────────────────────────────────────────────────
 * A tripwire, not a guarantee. `const pin: SomeNeverType = true` is defeated by a deliberate edit that
 * widens the excluded list in the very same change, and no test will notice that edit. The runtime half —
 * that the schema is a `strictObject` and therefore rejects an unexpected key — is in the refusals block
 * below, and the two halves catch different edits: the runtime one catches a schema that forgot to be
 * strict, the type one catches an interface widened on purpose.
 *
 * The mutation that proved this fires is a Zod optional key (`z.string().optional()`), because an
 * optional key is the only shape that widens the inferred output type WITHOUT breaking every object
 * literal — a *required* key produces `TS2741` at each literal and the pin is never reached, which is
 * how the first attempt at this probe measured nothing at all.
 */
describe("the recovery intent exposes no client-asserted field", () => {
  it("carries exactly the identifier and no second key", () => {
    // Checked against the module's OWN exported alias, so the name a consumer would use is the name that
    // is pinned. This runtime expectation cannot fail on its own — the declaration is the assertion, and
    // this line is what makes the compiler evaluate it.
    const assertion: RecoveryIntentKeysAreIdentifierOnly = true;
    expect(assertion).toBe(true);

    // And independently, through a spelling that lives HERE rather than in the module. Two spellings of
    // the same check, agreeing by construction: the point is that a widening of EITHER the interface or
    // the alias is caught, so one of them quietly weakening would otherwise go unnoticed.
    type IntentKeys = keyof RecoveryIntent;
    const viaThisFile: Record<Exclude<IntentKeys, "validatorId">, never> &
      Record<Exclude<"validatorId", IntentKeys>, never> = true;
    expect(viaThisFile).toBe(true);

    // The half that is NOT a type pin, and is what makes the first half worth having: the schema is
    // strict, so an unexpected key is refused at parse time rather than silently dropped.
    expect(() =>
      recoveryIntentSchema.parse({ validatorId: VALIDATOR, batchId: "batch_01" }),
    ).toThrow();
  });
});

/**
 * `runRecoveryLookup` — the Server Action's core, driven with injected fakes.
 *
 * ============================================================================================
 * WHAT THIS PROVES
 * ============================================================================================
 * That the lookup reads rather than writes, that it asks for a validator's OWN batches and nothing
 * else, that a client cannot name a batch, that the identity is re-checked, and — the claim the whole
 * boundary exists for — that a failed read is reported as a failure rather than as an answer.
 *
 * ============================================================================================
 * WHAT IT CANNOT PROVE
 * ============================================================================================
 * Nothing about Supabase. No credential is configured anywhere in this repository, so no Supabase
 * client has ever been constructed and no query below has been sent. Every repository here is a fake
 * that records calls, which proves what the core ASKED FOR and what it did with the reply — and
 * nothing whatever about how PostgREST would answer.
 */

/** `server-only` cannot be imported under Vitest, so the module marker is stubbed here. */
vi.mock("server-only", () => ({}));

const VALIDATOR = "VAL_0000beef";
const OTHER_VALIDATOR = "VAL_0000face";
const EARLY = "2026-10-01T09:00:00.000Z";
const LATE = "2026-10-01T11:00:00.000Z";

/** A `validators` profile shaped like the one `runAllocateBatch`'s tests use. */
const PROFILE = {
  id: VALIDATOR,
  ilocanoProficiency: "fluent",
  createdAt: EARLY,
  lastActiveAt: EARLY,
  totalValidations: 0,
} as const;

/** Every dependency call the core made, in order. A WRITE would show up here. */
type Call = string;

function makeDeps(
  overrides: {
    batches?: () => Promise<unknown[]>;
    answered?: () => Promise<string[]>;
    profile?: () => Promise<unknown>;
    configurationFails?: boolean;
  } = {},
) {
  const calls: Call[] = [];

  const dependencies = {
    validators: {
      // The parameter is omitted rather than named-and-unused: the core calls this with the identifier
      // it re-checks, and the fake asserts the CALL by name, so accepting the argument without naming
      // it is the same evidence without a lint warning. ESLint is configured to report unused
      // arguments — there is no `argsIgnorePattern` — so an underscore would be a lie about a binding
      // that is used.
      async findById() {
        calls.push("validators.findById");
        return overrides.profile ? overrides.profile() : Promise.resolve(PROFILE);
      },
    },
    validations: {
      async listEntryIdsForValidator() {
        calls.push("validations.listEntryIdsForValidator");
        return overrides.answered ? overrides.answered() : Promise.resolve([]);
      },
    },
    batches: {
      async listForRecovery() {
        calls.push("batches.listForRecovery");
        return overrides.batches ? overrides.batches() : Promise.resolve([]);
      },
    },
    ConfigurationFailure: class ServerEnvError extends Error {},
  } as unknown as RecoveryActionDependencies;

  return { dependencies, calls };
}

/** A batch with two entries, created at `createdAt`. */
function batch(id: string, entryIds: string[], createdAt: string, validatorId = VALIDATOR) {
  return { id, validatorId, createdAt, entryIds };
}

describe("the recovery lookup's refusals", () => {
  it("refuses anything that is not an identifier, including a batch id", async () => {
    // A client that sends a batch id is asking to resume a batch it named. There is no code path that
    // honours that, and the schema refuses the key rather than ignoring it — so the refusal is loud
    // instead of silent. `strictObject` is what makes this true; an ordinary object would drop the key
    // and proceed, which would be a different action entirely.
    const { dependencies, calls } = makeDeps();

    const withBatchId = await runRecoveryLookup(
      { validatorId: VALIDATOR, batchId: "batch_01" },
      dependencies,
    );
    expect(withBatchId).toEqual({ status: "failed", reason: "invalid" });

    // And NOTHING was read: the refusal happens before any repository call, which is itself the
    // guarantee — a rejected request must not be able to consult the database on its way out.
    expect(calls).toEqual([]);
  });

  it("refuses a request for an identifier this deployment has never enrolled", async () => {
    // `null` from `findById` means ABSENT, not failed. The distinction matters here more than
    // anywhere else in the file: this is the single most likely thing to be wrong for a returning
    // participant whose `localStorage` outlived the study data, and reporting it as a database fault
    // would tell a volunteer the study is broken when nothing is.
    const { dependencies, calls } = makeDeps({ profile: () => Promise.resolve(null) });

    const outcome = await runRecoveryLookup({ validatorId: VALIDATOR }, dependencies);

    expect(outcome).toEqual({ status: "failed", reason: "unknown_validator" });
    // The identity was checked BEFORE any recovery read. Without that order, an unenrolled browser
    // would be reported as having no interrupted batch — which is an answer, not a refusal.
    expect(calls).toEqual(["validators.findById"]);
  });

  it("reports a failed read as unavailable, and never as an answer", async () => {
    // THE CLAIM THE BOUNDARY EXISTS FOR. `none` is an answer to a research question: this validator
    // has no interrupted batch. Reporting a database fault as `none` would state that as a finding,
    // and the participant cannot tell it from a true answer.
    const batchesFail = makeDeps({ batches: () => Promise.reject(new Error("boom")) });
    expect(await runRecoveryLookup({ validatorId: VALIDATOR }, batchesFail.dependencies)).toEqual({
      status: "failed",
      reason: "unavailable",
    });

    const answeredFail = makeDeps({ answered: () => Promise.reject(new Error("boom")) });
    expect(await runRecoveryLookup({ validatorId: VALIDATOR }, answeredFail.dependencies)).toEqual({
      status: "failed",
      reason: "unavailable",
    });
  });

  it("reports a missing database as not_configured, not as a read fault", async () => {
    // A missing credential is an operator problem with a different fix from a failed query. In the
    // real deployment this branch is UNREACHABLE — the wrapper calls `getServerEnv()` while building
    // the argument, so the throw happens first — and it is named here so a caller that builds its
    // dependencies elsewhere still cannot report it as one.
    class ServerEnvError extends Error {}
    const dependencies = {
      validators: {
        findById() {
          return Promise.reject(new ServerEnvError("SUPABASE_URL is not set"));
        },
      },
      validations: { listEntryIdsForValidator: () => Promise.resolve([]) },
      batches: { listForRecovery: () => Promise.resolve([]) },
      ConfigurationFailure: ServerEnvError,
    } as unknown as RecoveryActionDependencies;

    expect(await runRecoveryLookup({ validatorId: VALIDATOR }, dependencies)).toEqual({
      status: "failed",
      reason: "not_configured",
    });
  });
});

describe("the recovery lookup's answers", () => {
  it("reports an explicit none for a validator with nothing to finish", async () => {
    // An explicit STATUS, never an absent property and never a `null`. The screen treats `none` and
    // `unavailable` identically, so the only place the difference can survive is here — and it only
    // survives if both are values a test can compare.
    const { dependencies } = makeDeps({
      batches: () => Promise.resolve([batch("batch_01", ["OD_0001"], EARLY)]),
      // Fully answered: the batch exists but there is nothing left in it.
      answered: () => Promise.resolve(["OD_0001"]),
    });

    expect(await runRecoveryLookup({ validatorId: VALIDATOR }, dependencies)).toEqual({
      status: "none",
    });
  });

  it("offers the batch with REMAINING counts, never answered ones", async () => {
    // The count is what the participant reads, and "3 entries left" is the only version of it that
    // describes their work. A count of answered entries would be a contribution total, which is a
    // different figure with a different meaning and reads as an incentive — and `design.md` D7 records
    // that the screen must not become one.
    const { dependencies } = makeDeps({
      batches: () => Promise.resolve([batch("batch_01", ["OD_0001", "OD_0002", "OD_0003"], EARLY)]),
      answered: () => Promise.resolve(["OD_0001"]),
    });

    const outcome = await runRecoveryLookup({ validatorId: VALIDATOR }, dependencies);

    expect(outcome).toEqual({
      status: "interrupted",
      offer: { batchId: "batch_01", remaining: 2, total: 3 },
    });
    // The exact key set, because "never answered ones" is a claim about what is ABSENT and an absence
    // check passes for the wrong reason. Three keys is the closed set.
    // Widened through `unknown` deliberately. A direct cast is refused by the compiler, which is the
    // type layer saying the same thing this assertion says: the offer's shape is exactly three fields
    // and widening it to `Record<string, unknown>` loses that. The `unknown` hop is the acknowledgement
    // that the cast is a measurement rather than a conversion.
    const offer = (outcome as unknown as { offer: Record<string, unknown> }).offer;
    expect(Object.keys(offer).sort()).toEqual(["batchId", "remaining", "total"]);
    expect(Object.keys(offer)).not.toContain("answered");
    expect(Object.keys(offer)).not.toContain("contribution");
  });

  it("asks for the answered set REUSED, not for a count of qualifying responses", async () => {
    // `tasks.md` 3.2 requires this read to be reused rather than rewritten. The observable difference
    // is what it counts: a `cannot_evaluate` response IS a response, so the validator will not be
    // offered that entry again — but it is NOT a qualifying validation and must not appear as one.
    // A single entry the validator can no longer be offered, counted as zero remaining.
    const { dependencies, calls } = makeDeps({
      batches: () => Promise.resolve([batch("batch_01", ["OD_0001"], EARLY)]),
      answered: () => Promise.resolve(["OD_0001"]),
    });

    expect(await runRecoveryLookup({ validatorId: VALIDATOR }, dependencies)).toEqual({
      status: "none",
    });
    // And exactly one read of it, once.
    expect(calls.filter((call) => call === "validations.listEntryIdsForValidator")).toHaveLength(1);
  });

  it("never offers a batch belonging to somebody else", async () => {
    // The repository filters by `validator_id`, so this is the SECOND place the ownership condition
    // is enforced rather than the first. `design.md` D1's reasoning — recognition is derived, never
    // stored — means the rule has to be able to see the row and reject it itself; a batch belonging
    // to another validator arriving here is a malformed reply, and the safe reading of a malformed
    // reply is no answer at all.
    const { dependencies } = makeDeps({
      batches: () => Promise.resolve([batch("batch_01", ["OD_0001"], EARLY, OTHER_VALIDATOR)]),
    });

    expect(await runRecoveryLookup({ validatorId: VALIDATOR }, dependencies)).toEqual({
      status: "none",
    });
  });

  it("ignores an entry-less batch without raising", async () => {
    // `findById` raises on this row; `listForRecovery` returns it. What the rule does with it is a
    // third behaviour, and the one that matters: there is no work in it, so it is not an offer — but
    // it is also not an exception, because an exception here would take down the whole lookup and
    // lose a REAL batch that came back in the same result set.
    const { dependencies } = makeDeps({
      batches: () =>
        Promise.resolve([batch("batch_residue", [], LATE), batch("batch_01", ["OD_0001"], EARLY)]),
    });

    // The residue is NEWER, so if it were eligible it would have won. It is not, and the older real
    // batch is offered instead — which is the only assertion that proves the skip rather than a
    // filter that dropped everything.
    expect(await runRecoveryLookup({ validatorId: VALIDATOR }, dependencies)).toEqual({
      status: "interrupted",
      offer: { batchId: "batch_01", remaining: 1, total: 1 },
    });
  });

  it("is a READ: it issues no write of any kind", async () => {
    // The dependencies offer three reads and no write method at all, so a write could not be issued
    // even by accident — the fakes make the claim structural rather than observational. What is
    // asserted is that the two reads it DOES need both happened, because "made no write" and "made no
    // call" look identical from outside.
    const { dependencies, calls } = makeDeps({
      batches: () => Promise.resolve([batch("batch_01", ["OD_0001"], EARLY)]),
    });

    await runRecoveryLookup({ validatorId: VALIDATOR }, dependencies);

    expect(calls).toEqual([
      "validators.findById",
      "batches.listForRecovery",
      "validations.listEntryIdsForValidator",
    ]);
    // No call name contains a write verb. Cheap, and it is a closed statement about what these three
    // fakes can do rather than a hope about the code.
    expect(calls.some((call) => /insert|update|delete|create|touch/i.test(call))).toBe(false);
  });
});
