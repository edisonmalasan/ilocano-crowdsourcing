import "server-only";

import { recognizeInterruptedBatch, type InterruptedBatchOffer } from "@/lib/domain/batch-recovery";
import type {
  BatchesRepository,
  ValidationsRepository,
  ValidatorsRepository,
} from "@/lib/repositories";
import { isWriteIntentError, parseWriteIntent } from "@/lib/server/write-intake";
import { anonymousValidatorIdSchema } from "@/schemas/validator";
import { z } from "zod";

/**
 * ============================================================================
 * THE LOOKUP SERVER ACTION'S CORE — the testable half
 * ============================================================================
 * Same split as `allocation-actions-core.ts`, and for the same reason: a file marked `"use server"`
 * may only export async functions, which would make every decision below reachable only by
 * constructing a Supabase client. No credential exists in this repository, so a client cannot be
 * constructed. Every claim in this header is therefore checkable here, with fakes, and no database.
 *
 * ============================================================================
 * THERE IS NO `batchId` PARAMETER, AND THAT IS THE POINT (`design.md` D9)
 * ============================================================================
 * The intent schema has exactly ONE key. The recovery requirement is that a participant resumes THEIR
 * OWN most recent interrupted batch, and the way that is guaranteed rather than promised is that no
 * code path by which a client names a batch exists. The type below is the enforcement, in the same
 * way `AllocationIntent`'s key set is — and for the same measured reason, recorded in that file: a
 * behavioural test cannot pin the absence of a parameter, because a mutation may name its field
 * anything, and enumerating plausible names does not close the gap.
 *
 * ============================================================================
 * WHY THE IDENTITY IS RE-CHECKED RATHER THAN TRUSTED
 * ============================================================================
 * The identifier arrives from browser storage, so it is whatever the browser says. A returning
 * participant whose storage holds an identifier that was never enrolled would otherwise be told
 * "you have an interrupted batch" or offered a resume link into somebody else's batch — both of
 * which are answers to a question about an identity that does not exist. The re-check costs one read
 * and is the same one `runAllocateBatch` performs; the refusal is the same refusal.
 */
/**
 * Exported so its STRICTNESS is observable. `RecoveryIntent` is the inferred type and a type cannot
 * refuse anything at runtime; if the schema stayed module-private, the guarantee that an unexpected key is
 * *rejected* rather than silently stripped would have no witness anywhere — and a schema that was
 * accidentally loosened to `z.object` would keep the same type in every common case while quietly dropping
 * a client-supplied field. Exporting it is what lets a test close that half too.
 */
export const recoveryIntentSchema = z.strictObject({
  validatorId: anonymousValidatorIdSchema,
});

export type RecoveryIntent = z.infer<typeof recoveryIntentSchema>;

/** The keys of `T`, as a union. */
type KeyUnion<T> = keyof T;

/** Exact (not assignable) equality, so a WIDER key set fails rather than passing. */
type Equals<A, B> =
  (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2 ? true : false;

/**
 * Type-level pin on the RECOVERY INTENT's key set (`tasks.md` 6.1).
 *
 * A third key fails `pnpm run typecheck` with `TS2322: Type 'true' is not assignable to type 'never'`
 * whatever it is called, because the compiler sees the absence of a key that does not exist yet. A
 * test cannot do this: `recovery-actions-core.test.ts` smuggles plausible extra keys and asserts they
 * are refused, which catches a schema that forgot to be `strictObject` but cannot catch a fourth key
 * someone added on purpose.
 *
 * Stated plainly, because it is the same caveat the allocation pin carries: this is defeatable by an
 * author who widens the union in the same edit. It is not a guarantee; it is a tripwire.
 */
export type RecoveryIntentKeysAreIdentifierOnly =
  Equals<KeyUnion<RecoveryIntent>, "validatorId"> extends true ? true : never;

/**
 * A former export, DELETED rather than given an assertion site.
 *
 * `InterruptedBatchOfferKeysAreBatchIdRemainingAndTotalOnly` was a type-level pin on the offer's key set,
 * and `InterruptedBatchOffer`'s own documentation named it as the enforcement — a false claim, because an
 * alias with no assertion site is never evaluated by the compiler.
 *
 * Measured, with a control: adding an **optional** fourth field to the interface fails `tsc` identically
 * with the alias present and with it deleted, and the failure names `tests/unit/batch-recovery.test.ts`.
 * That is the whole reason this is a deletion and not a repair — the guarantee is enforced there, by an
 * assertion that closes the key set at the type layer *and* reads it off a real offer at runtime. The
 * alias was a second spelling of an existing guarantee, and a reader who believed it was the enforcement
 * would never have found the enforcement that actually held.
 *
 * The mutation is worth recording because the obvious one measures nothing: a **required** fourth field
 * breaks every object literal with `TS2741` and the key-set check is never reached, so the probe appears
 * to prove the pin fires when it has only proved that the interface widened.
 */

/**
 * Why an offer could not be determined.
 *
 * `unavailable` is NOT `none`, and the distinction is the point. `none` is an answer: this validator
 * has no interrupted batch. `unavailable` is the absence of an answer: a read failed. Reporting the
 * second as the first would tell a participant "you have nothing to finish" on the strength of a
 * database fault, and the participant cannot tell that from a true answer — which is why D4 requires
 * the two to render identically at the SCREEN and be distinguished HERE, where a test can see them.
 */
export type RecoveryFailureReason =
  "invalid" | "unknown_validator" | "unavailable" | "not_configured";

/**
 * The result of one lookup.
 *
 * THREE modelled outcomes for the recognition itself — an offer, an explicit *none*, an explicit
 * *unavailable* — plus the refusals every other validator-keyed operation returns, so that a caller
 * switches over one closed union and a new outcome is a compile error at each consumer rather than a
 * branch quietly skipped.
 */
export type RecoveryOutcome =
  | { readonly status: "interrupted"; readonly offer: InterruptedBatchOffer }
  | { readonly status: "none" }
  | { readonly status: "failed"; readonly reason: RecoveryFailureReason };

export interface RecoveryActionDependencies {
  readonly validators: ValidatorsRepository;
  readonly validations: ValidationsRepository;
  readonly batches: BatchesRepository;
  /**
   * Thrown by the dependency builder when the deployment has no database configured.
   *
   * A constructor, exactly as in `AllocationActionDependencies`, and for the same reason: this file
   * must be able to recognise the condition without importing the environment module, which is what
   * keeps it testable without stubbing `process.env`. In the real deployment the wrapper calls
   * `getServerEnv()` while BUILDING the argument, so this branch is unreachable there — it exists so
   * a caller supplying dependencies from elsewhere still cannot report a missing database as a
   * read fault.
   */
  readonly ConfigurationFailure: new (...args: never[]) => Error;
}

function isConfigurationFailure(error: unknown, deps: RecoveryActionDependencies): boolean {
  return error instanceof deps.ConfigurationFailure;
}

/**
 * Looks for the validator's own interrupted batch.
 *
 * A READ. It creates nothing, and that is stated in `design.md` D8 as a decision rather than an
 * accident: it goes through the same repository interfaces and the same typed-error mapping as any
 * other read, and being an action rather than a route handler keeps one transport for client/server
 * conversation and keeps the repository out of the client module graph by construction.
 */
export async function runRecoveryLookup(
  raw: unknown,
  deps: RecoveryActionDependencies,
): Promise<RecoveryOutcome> {
  let intent: z.output<typeof recoveryIntentSchema>;
  try {
    intent = parseWriteIntent(recoveryIntentSchema, raw, { schemaName: "recoveryIntent" });
  } catch (error) {
    if (isWriteIntentError(error)) return { status: "failed", reason: "invalid" };
    throw error;
  }

  try {
    // The identity re-check. `null` means ABSENT, not failed — the distinction `findById` documents,
    // and the reason this is `unknown_validator` rather than `unavailable`: nothing went wrong, the
    // browser simply holds an identifier this deployment has never enrolled. That is the single most
    // likely thing to go wrong for a returning participant, and reporting it as a database fault would
    // tell someone the study is broken when nothing is.
    const profile = await deps.validators.findById(intent.validatorId);
    if (profile === null) return { status: "failed", reason: "unknown_validator" };

    const [batches, answeredEntryIds] = await Promise.all([
      deps.batches.listForRecovery(intent.validatorId),
      // REUSED, NOT REWRITTEN (`tasks.md` 3.2). There is one way in this codebase to ask which
      // entries a validator has answered, it selects one column, and this read needs no additional
      // question about it. Note what it does NOT filter on: a `cannot_evaluate` response is a
      // response, so it counts as answered here. That is correct for THIS purpose — the validator will
      // not be offered that entry again — and it is why the count this produces is "remaining", not
      // "qualifying". `docs/ROADMAP.md` records the two wrong implementations this avoids, both of
      // which live in the layer that FETCHES this set and neither of which could be fixed here.
      deps.validations.listEntryIdsForValidator(intent.validatorId),
    ]);

    const recognition = recognizeInterruptedBatch(
      intent.validatorId,
      batches,
      new Set(answeredEntryIds),
    );

    // `none` is returned as its own status rather than being folded into `failed`. D4 models the two as
    // distinct because they are distinct: one is an answer, the other is the absence of one.
    if (recognition.kind === "none") return { status: "none" };
    return { status: "interrupted", offer: recognition.offer };
  } catch (error) {
    if (isConfigurationFailure(error, deps)) return { status: "failed", reason: "not_configured" };
    // Everything else is `unavailable`. A `RepositoryError` is a read that failed, which is exactly
    // what `unavailable` means, and swallowing it into `none` is the single failure this boundary is
    // built to prevent: it would report a database fault as a confident "you have nothing to finish",
    // which is a research statement nobody asked for.
    return { status: "failed", reason: "unavailable" };
  }
}
