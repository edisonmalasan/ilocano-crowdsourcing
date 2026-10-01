import "server-only";

import { isWriteIntentError, parseWriteIntent } from "@/lib/server/write-intake";
import { anonymousValidatorIdSchema } from "@/schemas/validator";
import { z } from "zod";

import { allocateBatch, type AllocationDependencies } from "./allocate-batch";
import type { AllocationOutcome } from "@/schemas/batch";

/**
 * The allocation Server Action's core — the testable half.
 *
 * ============================================================================
 * WHY THE CORE IS SEPARATE FROM THE `"use server"` WRAPPER
 * ============================================================================
 * A file marked `"use server"` may only export async functions, which would make the decisions below
 * impossible to unit test without a network. So they live here as plain functions over injected
 * dependencies, and `actions.ts` is a wrapper whose only job is to build the real dependencies and
 * delegate. Every claim in this header is therefore verifiable in this repository with no Supabase
 * project and no credential.
 *
 * ============================================================================
 * WHAT THE INTENT SCHEMA IS FOR, BEYOND VALIDATION
 * ============================================================================
 * The spec says a client submitting an entry list, an order, or a coverage target has those values
 * IGNORED. Ignoring them would also be acceptable behaviour, so it is worth being precise about which
 * this implementation chose.
 *
 * It REJECTS them. The difference matters in the failure mode: a payload carrying `entryIds` that is
 * silently stripped and honoured on the rest looks, from the outside, exactly like a successful
 * request whose values happened not to matter — and the first time somebody added an `entryIds` field
 * that the service really did read, nothing about the request would have looked different. `strictObject`
 * makes an attempt to dictate the batch a `WriteIntentError` with nothing read and nothing written,
 * which is the outcome the boundary rule is for.
 *
 * This is also why `requestedSize` is the ONLY other key: it is a preference for how many entries to
 * receive, capped by `resolveBatchSize` against the server's configuration. It cannot become a larger
 * batch, because the ceiling lives in code the client does not hold.
 *
 * ============================================================================
 * WHY THE RESULT TYPE IS `AllocationOutcome` AND NOT A NEW ONE
 * ============================================================================
 * The service already returns a closed union, and the boundary adds exactly two outcomes to it:
 * `invalid` (nothing read, nothing written) and `not_configured` (this deployment has no database).
 * Declaring a parallel result type would create a second vocabulary for the same research facts and a
 * second place for the mapping to drift. `not_configured` in particular is NOT a value the service can
 * produce — it has no repository to fail — so it is added here, where the environment check lives.
 */

/**
 * What a batch request may contain.
 *
 * `requestedSize` is `.optional()` rather than required-nullable, because a client that expresses no
 * preference is a normal case and not a malformed request; unlike the screening answer, there is no
 * meaning to distinguish "no preference" from "declined", so requiring the key would only manufacture a
 * second spelling of absence.
 */
const allocationIntentSchema = z.strictObject({
  validatorId: anonymousValidatorIdSchema,
  requestedSize: z.number().int("requestedSize must be an integer").min(1).optional(),
});

/**
 * What a client's batch request is allowed to be, as a TYPE.
 *
 * The schema above is the runtime enforcement and this is the compile-time one, and they are
 * different layers doing different jobs: `strictObject` refuses an extra key that arrives over the
 * wire, while this name is what a caller can write down — so a component that tried to send a
 * `completedCount` would not compile rather than being refused at runtime.
 */
export type AllocationIntent = z.infer<typeof allocationIntentSchema>;

/** The keys of `T`, as a union. */
type KeyUnion<T> = keyof T;

/** Exact (not assignable) equality, so a WIDER key set fails rather than passing. */
type Equals<A, B> =
  (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2 ? true : false;

/**
 * Type-level pin on the ALLOCATION INTENT's key set (`tasks.md` 6.1).
 *
 * The requirement is that a client cannot dictate completion — cannot supply a completion status, an
 * answered count, or a remaining count, and have any of them mean anything. A behavioural test cannot
 * pin that, and the reason is measured rather than argued: in `coverage-aware-allocation` a two-file
 * mutation that added a `clientOrder` field to `AllocationRequest` AND had the service honour it left
 * the whole suite green at `51 passed (51)` against a `51 passed (51)` control. The obvious repair — a
 * test that smuggles an order into the request and asserts it is ignored — was also written, measured,
 * and does not work: the mutation honours a field named `clientOrder`, a test smuggling `order` never
 * triggers it, and the suite was still `52 passed (52)`. Enumerating plausible key names cannot close
 * the gap, because a mutation may name its field anything.
 *
 * `Equals` is used rather than `Exclude<…, K> extends never` because this is a key-set pin and
 * `Equals` is the stronger of the two: it also fails if a key is REMOVED, so the pin cannot be
 * satisfied by deleting `requestedSize`. A consumer writing
 * `const pin: AllocationIntentKeysAreIdentifierAndSizeOnly = true` fails `pnpm run typecheck` with
 * `TS2322: Type 'true' is not assignable to type 'never'` the moment any third key appears, whatever
 * it is called.
 *
 * The two keys are the two the requirement needs and no others: who the batch is for, and a size
 * PREFERENCE the server caps. Neither is a fact about a validator's progress.
 */
export type AllocationIntentKeysAreIdentifierAndSizeOnly =
  Equals<KeyUnion<AllocationIntent>, "validatorId" | "requestedSize"> extends true ? true : never;

export interface AllocationActionDependencies extends AllocationDependencies {
  /**
   * Thrown by the dependency builder when the deployment has no database configured. Typed as a
   * constructor so this file can recognise the condition without importing the environment module,
   * which is what keeps it testable without stubbing `process.env`.
   *
   * In the real deployment this branch is UNREACHABLE, because `actions.ts` calls `getServerEnv()`
   * while BUILDING the argument to this function, so the throw happens before it is entered. It exists
   * so that a caller who supplies dependencies from somewhere else still cannot report a missing
   * database as a persistence fault — and `tests/unit/allocation-actions-wrapper.test.ts` drives the
   * wrapper, which is the path that actually runs.
   */
  readonly ConfigurationFailure: new (...args: never[]) => Error;
}

/** True when the failure is "this deployment has no database", and only that. */
function isConfigurationFailure(error: unknown, deps: AllocationActionDependencies): boolean {
  return error instanceof deps.ConfigurationFailure;
}

/**
 * Allocates a batch from an untrusted payload.
 *
 * The payload is re-parsed with the shared write-intake boundary BEFORE the service is called, so a
 * rejected request cannot reach a repository even when dependencies were already available. A test
 * counts repository calls on the rejected path rather than trusting this comment.
 */
export async function runAllocateBatch(
  raw: unknown,
  deps: AllocationActionDependencies,
): Promise<AllocationOutcome> {
  let intent: z.output<typeof allocationIntentSchema>;
  try {
    intent = parseWriteIntent(allocationIntentSchema, raw, { schemaName: "allocationIntent" });
  } catch (error) {
    if (isWriteIntentError(error)) return { status: "failed", reason: "invalid" };
    throw error;
  }

  try {
    return await allocateBatch(
      { validatorId: intent.validatorId, requestedSize: intent.requestedSize },
      deps,
    );
  } catch (error) {
    if (isConfigurationFailure(error, deps)) return { status: "failed", reason: "not_configured" };
    // The service already converts a `RepositoryError` into `persistence` and re-raises everything
    // else. So a throw that reaches HERE is a non-repository failure — a bug — and reporting it as
    // `persistence` would be the one lie this boundary must not tell: it would send an operator
    // looking at the database for a defect that is in the code. It propagates instead, and the
    // wrapper's own catch decides what to log.
    throw error;
  }
}
