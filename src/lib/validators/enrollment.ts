import "server-only";

import {
  createAnonymousValidatorId,
  isAnonymousValidatorIdFormat,
} from "@/lib/domain/anonymous-validator-id";
import { isRepositoryError, type ValidatorsRepository } from "@/lib/repositories";
import { parseWriteIntent } from "@/lib/server/write-intake";
import {
  ilocanoProficiencySchema,
  type AnonymousValidatorId,
  type IlocanoProficiency,
  type ValidatorProfile,
} from "@/schemas/validator";

/**
 * Anonymous validator enrollment.
 *
 * ============================================================================
 * WHY THE SERVICE OWNS EVERY AUTHORITATIVE VALUE
 * ============================================================================
 * The identifier, both timestamps, and the validation counter are all minted or
 * derived HERE, from a cryptographic source and an injected clock. The caller
 * supplies the screening answer and nothing else. A browser therefore cannot
 * choose its own identity, backdate its own enrollment, or inflate its own
 * participation count, because there is no parameter it could use to try.
 *
 * That is the reason this module has no `id` parameter rather than a
 * convenience one. The absence of a parameter is the guarantee; adding an
 * optional one that a caller "cannot really" forge would replace a structural
 * property with a convention.
 *
 * ============================================================================
 * WHY SCREENING RIDES IN HERE RATHER THAN IN A SECOND WRITE
 * ============================================================================
 * See design.md D1. Creating first and recording proficiency second would need a
 * repository method that does not exist, cost two writes, and leave a participant
 * holding an identity with no screening answer if they abandoned between the two
 * steps. The `ilocano_proficiency` column is nullable precisely so a validator may
 * exist without a screening answer — but "declined to answer" and "abandoned
 * midway" are different research facts, and only this ordering keeps them
 * distinguishable.
 *
 * ============================================================================
 * EXPECTED OUTCOMES ARE VALUES, NOT THROWS
 * ============================================================================
 * "The repository rejected this" and "the database is unreachable" are ordinary
 * results of an ordinary network call, and the action boundary has to render each
 * one differently. Returning a discriminated result keeps that mapping a
 * `switch` instead of exception matching. `RepositoryError` from a caller is
 * still re-raised, because a caller that swallows a repository failure would
 * defeat the seam's rule 2 ("no data" and "the query failed" must stay
 * distinguishable).
 */

/** What the caller asked for. A screening answer, and nothing else. */
export interface EnrollmentRequest {
  /**
   * Exactly one approved proficiency choice. There is no decline value: the
   * corrected methodology requires an answer before an enrollment may be
   * created, so "declined" and "not supplied" are both refused upstream as
   * invalid rather than distinguished here. The stored profile shape stays
   * nullable for rows created before the correction — that is a property of
   * old rows, not a value this request may carry.
   */
  readonly ilocanoProficiency: IlocanoProficiency;
}

export interface EnrollmentDependencies {
  readonly validators: ValidatorsRepository;
  /**
   * Injected rather than read from `Date.now()` inside, for the same reason
   * `ValidatorsRepository.touchLastActive` takes `at` from its caller: the
   * service, not the ambient clock, owns when something happened. It is also
   * what makes "the server derived this timestamp" a testable claim.
   */
  readonly now: () => Date;
}

/** Stored counters always start at zero: a new validator has validated nothing. */
const INITIAL_TOTAL_VALIDATIONS = 0;

/**
 * Every variant here is produced. There is deliberately no "already exists"
 * variant: a duplicate id is a `RepositoryError` from `create` like any other
 * failure, because a freshly minted 32-bit identifier colliding is not a case
 * this service can honestly distinguish from any other insert failure. Adding a
 * variant nothing returns would make the union a lie about what the service
 * knows.
 */
export type EnrollmentOutcome =
  | { readonly status: "enrolled"; readonly validatorId: AnonymousValidatorId }
  | { readonly status: "failed"; readonly reason: "persistence_error" };

/**
 * Parses a screening answer that arrived from the network.
 *
 * The write-intake boundary has already run before this is called; this is a
 * second, narrower guard so the service can be called directly (by a test, or by
 * a future non-action caller) with an unvalidated value and still refuse to store
 * anything but one of the five approved choices. `null`, `undefined`, and any
 * unapproved value throw `WriteIntentError`: since the methodology correction
 * there is no decline value to convert them into, and silently converting an
 * invalid answer into anything storable is exactly the conflation this module
 * exists to prevent.
 *
 * @throws {WriteIntentError} via `parseWriteIntent` when the value is not one of
 * the five approved choices. The action boundary catches it and reports the field
 * error; nothing is persisted on the way out.
 */
export function parseScreeningAnswer(raw: unknown): IlocanoProficiency {
  // Imported lazily-by-name to keep the single shared schema as the one definition
  // of "one of the five approved choices".
  return parseWriteIntent(ilocanoProficiencySchema, raw, { schemaName: "screeningAnswer" });
}

/**
 * Creates the anonymous validator profile.
 *
 * Exactly one `create` call is made, and its result is read back rather than
 * echoed: the identifier the caller receives is the one the repository returned,
 * so a repository that stored something different cannot be papered over.
 */
export async function enrollValidator(
  request: EnrollmentRequest,
  dependencies: EnrollmentDependencies,
): Promise<EnrollmentOutcome> {
  const timestamp = dependencies.now().toISOString();

  // The service applies its own guard rather than trusting its input type, so a
  // direct caller that is not the action boundary still cannot store an
  // unapproved proficiency. At the action boundary this is a second parse of an
  // already-validated value, which is cheap and keeps the guarantee here.
  const proficiency = parseScreeningAnswer(request.ilocanoProficiency);

  const profile: ValidatorProfile = {
    id: createAnonymousValidatorId() as AnonymousValidatorId,
    ilocanoProficiency: proficiency,
    createdAt: timestamp,
    lastActiveAt: timestamp,
    totalValidations: INITIAL_TOTAL_VALIDATIONS,
  };

  try {
    const stored = await dependencies.validators.create(profile);
    return { status: "enrolled", validatorId: stored.id };
  } catch (error) {
    if (!isRepositoryError(error)) throw error;
    return { status: "failed", reason: "persistence_error" };
  }
}

export type ResumeOutcome =
  | { readonly status: "restored"; readonly validatorId: AnonymousValidatorId }
  /** The stored identifier names nobody. Reported as absence, never as an error. */
  | { readonly status: "absent" };

/**
 * Resolves a browser-stored identifier to a server-confirmed validator.
 *
 * An unrecognised or malformed identifier returns `absent` rather than raising,
 * because a stale local-storage value is the single most likely thing to go wrong
 * on a returning visit and it must not present as a failure. It is NOT reused:
 * the caller mints a fresh identity instead, so a validator is never handed an
 * identifier belonging to nobody.
 *
 * Only the identifier crosses back to the browser. The stored profile's screening
 * answer, counters, and timestamps are deliberately not returned — the public
 * experience has no use for them, and the anonymity guarantee is easier to audit
 * if the browser simply never receives them.
 */
export async function resumeValidator(
  candidate: string,
  dependencies: Pick<EnrollmentDependencies, "validators">,
): Promise<ResumeOutcome> {
  if (!isAnonymousValidatorIdFormat(candidate)) {
    return { status: "absent" };
  }

  const profile = await dependencies.validators.findById(candidate as AnonymousValidatorId);

  return profile === null ? { status: "absent" } : { status: "restored", validatorId: profile.id };
}
