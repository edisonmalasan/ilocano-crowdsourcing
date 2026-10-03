import "server-only";

import type { ValidatorsRepository } from "@/lib/repositories";
import { isWriteIntentError, parseWriteIntent } from "@/lib/server/write-intake";
import {
  anonymousValidatorIdSchema,
  ilocanoProficiencySchema,
  type AnonymousValidatorId,
} from "@/schemas/validator";
import { z } from "zod";

import {
  enrollValidator,
  resumeValidator,
  type EnrollmentOutcome,
  type ResumeOutcome,
} from "./enrollment";

/**
 * Onboarding action core — the testable half of the Server Actions.
 *
 * ============================================================================
 * WHY THE CORE IS SEPARATE FROM THE "use server" WRAPPER
 * ============================================================================
 * A file marked `"use server"` may only export async functions, which would make
 * the decision logic here impossible to unit test without a network. So the
 * decisions live here as plain functions over injected dependencies, and
 * `actions.ts` is a thin wrapper whose only job is to build the real
 * dependencies and delegate. Every claim below is therefore verifiable in this
 * repository with no Supabase project and no credential.
 *
 * ============================================================================
 * WHAT A CLIENT MAY RECEIVE
 * ============================================================================
 * A success carries an identifier and nothing else. A failure carries a REASON and
 * never an identifier — not even on a failure that happened after an identifier
 * was minted — because a client that can read an identifier out of a failed
 * response will treat it as stored.
 *
 * The reasons are a closed set, and `not_configured` is deliberately distinct
 * from `persistence`. "This deployment has no database" is the expected state of
 * the current environment and deserves a plain "the study is not open" message; a
 * real write failure is a different condition. Collapsing them would be less code
 * and would erase the distinction that matters most right now.
 *
 * ============================================================================
 * THE SERVER NEVER TOUCHES BROWSER STORAGE
 * ============================================================================
 * Browser storage does not exist on the server, so these functions neither read
 * nor write it. Storing the returned identifier, and clearing a stale one, is the
 * client component's job. That is not a workaround: it is the correct direction
 * of travel, and it keeps this module free of any client-module import.
 */

/**
 * What the screening form submits. Proficiency is REQUIRED and the key with it.
 *
 * The corrected methodology admits no decline path: a submission without exactly
 * one approved choice is refused as invalid before any persistence operation is
 * attempted, and there is no absence value an enrollment can be created with.
 * The key is REQUIRED and non-nullable, never optional. An earlier version used
 * `.optional()`, which meant a payload of entirely the wrong shape — an object
 * with no `ilocanoProficiency` key at all — parsed successfully and was recorded
 * as a *declined* screening answer. That is the exact conflation this module
 * exists to prevent: "the participant chose not to answer" and "the request was
 * malformed" are different research facts, and an optional key cannot tell them
 * apart. The form always sends the key explicitly, so requiring it costs nothing.
 *
 * The stored profile shape stays nullable for rows created before the
 * methodology correction. Tightening the intake must never be read as
 * permission to fabricate a value for those rows.
 *
 * The value is validated against the SHARED proficiency enum, not against a bare
 * `z.string()`. An earlier version accepted any string here and relied on a
 * second parse further in, which threw from inside the persistence try-block: an
 * unapproved answer was then reported as a `persistence` failure, naming a
 * database fault that never happened, with no repository call made. Validating
 * here means the refusal is a `WriteIntentError` like every other rejection, and
 * it costs one shared definition rather than two.
 */
const enrollmentIntentSchema = z.strictObject({
  ilocanoProficiency: ilocanoProficiencySchema,
});

/**
 * The resume action accepts a bare identifier. Nothing else, ever.
 *
 * Deliberately `z.string()` with no `.min(1)`: a stale or emptied local-storage
 * value is not something the participant did wrong, so it must reach the
 * identifier check below and be reported as `absent` — the client should offer a
 * fresh enrollment rather than show an error. A `.min(1)` here would reject it
 * one layer earlier as `invalid`, which reads as a bug to the person looking at it.
 */
const resumeIntentSchema = z.strictObject({
  storedId: z.string(),
});

export type OnboardingFailureReason = "not_configured" | "invalid" | "persistence";

export type EnrollActionResult =
  | { readonly status: "enrolled"; readonly validatorId: AnonymousValidatorId }
  | { readonly status: "failed"; readonly reason: OnboardingFailureReason };

export type ResumeActionResult =
  | { readonly status: "restored"; readonly validatorId: AnonymousValidatorId }
  /** The stored identifier names nobody. Not an error: the client should re-enroll. */
  | { readonly status: "absent" }
  | { readonly status: "failed"; readonly reason: OnboardingFailureReason };

export interface OnboardingActionDependencies {
  readonly validators: ValidatorsRepository;
  readonly now: () => Date;
  /**
   * Thrown by the dependency builder when the deployment has no database
   * configured. Typed as a constructor so the core can recognise the condition
   * without importing the environment module, which keeps this file testable
   * without stubbing `process.env`.
   */
  readonly ConfigurationFailure: new (...args: never[]) => Error;
}

/** True when the failure is "this deployment has no database", and only that. */
function isConfigurationFailure(error: unknown, deps: OnboardingActionDependencies): boolean {
  return error instanceof deps.ConfigurationFailure;
}

/**
 * Creates the anonymous validator from a screening intent.
 *
 * Re-validates the payload with the shared write-intake boundary BEFORE building
 * dependencies, so a rejected payload cannot reach a repository even if
 * dependencies were already available. A test asserts zero repository calls on
 * the rejected path.
 */
export async function runEnroll(
  raw: unknown,
  deps: OnboardingActionDependencies,
): Promise<EnrollActionResult> {
  let intent: z.output<typeof enrollmentIntentSchema>;
  try {
    intent = parseWriteIntent(enrollmentIntentSchema, raw, { schemaName: "enrollmentIntent" });
  } catch (error) {
    if (isWriteIntentError(error)) return { status: "failed", reason: "invalid" };
    throw error;
  }

  let outcome: EnrollmentOutcome;
  try {
    outcome = await enrollValidator(
      { ilocanoProficiency: intent.ilocanoProficiency },
      { validators: deps.validators, now: deps.now },
    );
  } catch (error) {
    if (isConfigurationFailure(error, deps)) return { status: "failed", reason: "not_configured" };
    return { status: "failed", reason: "persistence" };
  }

  if (outcome.status === "failed") {
    // The service already classified this; re-deriving the reason here would be a
    // second place to get the mapping wrong.
    return { status: "failed", reason: "persistence" };
  }

  return { status: "enrolled", validatorId: outcome.validatorId };
}

/**
 * Resolves a client-supplied stored identifier to a server-confirmed validator.
 *
 * The write intake checks only "a non-empty string", so this is the check that
 * actually means anything, and a value failing it is reported as `absent` rather
 * than `invalid` — a stale or tampered local-storage value is not something the
 * participant did wrong, and `invalid` reads to them like a bug.
 *
 * HONEST NOTE ON REDUNDANCY, because a deliberate duplicate that is not labelled as
 * one becomes accidental the next time someone edits it. `resumeValidator` below
 * re-checks the same format with `isAnonymousValidatorIdFormat`. The two agree
 * because both read the single `ANONYMOUS_VALIDATOR_ID_PATTERN`, and
 * `validators-identifier-format.test.ts` asserts that they continue to agree. So the
 * check here is NOT a second security boundary. What it is for is narrowing an
 * `unknown` from the network to the branded `AnonymousValidatorId` the service takes,
 * without a cast. If the service's parameter type ever widens, the boundary
 * re-validation rule is what keeps this parse necessary.
 */
export async function runResume(
  raw: unknown,
  deps: OnboardingActionDependencies,
): Promise<ResumeActionResult> {
  let intent: z.output<typeof resumeIntentSchema>;
  try {
    intent = parseWriteIntent(resumeIntentSchema, raw, { schemaName: "resumeIntent" });
  } catch (error) {
    if (isWriteIntentError(error)) return { status: "failed", reason: "invalid" };
    throw error;
  }

  const parsed = anonymousValidatorIdSchema.safeParse(intent.storedId);
  if (!parsed.success) return { status: "absent" };

  let outcome: ResumeOutcome;
  try {
    outcome = await resumeValidator(parsed.data, { validators: deps.validators });
  } catch (error) {
    if (isConfigurationFailure(error, deps)) return { status: "failed", reason: "not_configured" };
    return { status: "failed", reason: "persistence" };
  }

  return outcome.status === "restored"
    ? { status: "restored", validatorId: outcome.validatorId }
    : { status: "absent" };
}
