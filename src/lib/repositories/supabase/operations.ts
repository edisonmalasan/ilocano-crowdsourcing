import "server-only";

import type {
  BatchesRepository,
  DatasetEntriesRepository,
  RepositoryOperation,
  SignInAttemptsRepository,
  ValidationsRepository,
  ValidatorsRepository,
} from "@/lib/repositories";

/**
 * The link between an interface method and the `RepositoryOperation` it reports on failure.
 *
 * THE TWO DIVERGENCES, and WHERE THEY ARE PINNED
 * ------------------------------------------------
 * `RepositoryOperation` in `@/lib/repositories/errors` is a hand-written vocabulary in which the
 * verb is the PERSISTENCE verb: `validators.insert` and `dataset_entries.list`. The interfaces
 * name their methods after the DOMAIN verb: `create` and `listActive`. Nothing joined the two, so
 * a future implementer could raise `"validators.create"` (not in the union, caught) or, far worse,
 * attribute a `findById` failure to `"validators.insert"` (in the union, silently wrong), and
 * nothing would complain.
 *
 * Each map below is annotated with `satisfies Record<keyof <Interface>, RepositoryOperation>`,
 * which makes both mistakes compile errors:
 *
 *   - a name that is not in the `RepositoryOperation` union, or
 *   - a method that an interface gains without a corresponding entry here.
 *
 * That is a type-level assertion rather than a comment, so the reconciliation cannot rot. The
 * repository classes read their operation names from these maps, so the value that ends up on
 * `RepositoryError.operation` is the same one the compiler checked against the interface.
 *
 * There are exactly TWO places where a method name and its operation name differ, and they are
 * marked below rather than left for a reader to discover:
 *
 *   `ValidatorsRepository.create`  ->  "validators.insert"
 *   `DatasetEntriesRepository.listActive`  ->  "dataset_entries.list"
 *
 * A THIRD divergence arrived with `BatchesRepository`, and it is the same shape as the first:
 *
 *   `BatchesRepository.create`  ->  "validation_batches.insert"
 *
 * A FOURTH arrived with interrupted-batch recovery:
 *
 *   `BatchesRepository.listForRecovery`  ->  "validation_batches.listForRecovery"
 *
 * Both are named here rather than left for a reader to derive, because the union is named after the
 * TABLE and the method after the aggregate: writing `"validation_batches.create"` would have been
 * defensible and would still have diverged from `"validators.insert"` two entries above it. One
 * convention for the whole union beats four locally reasonable ones.
 *
 * `BatchesRepository.findById` is NOT a divergence — it happens to read the same in both places,
 * which is recorded only so a future author does not assume the absence of a comment means an
 * oversight. The fourth divergence is the near miss worth noting: `listForRecovery` could have been
 * `"validation_batches.list"`, which is defensible on its own terms and would still have been a fifth
 * spelling of the same idea.
 *
 * THE UNION IS THE AUTHORITY, and it is NOT renamed here.
 * `RepositoryOperation` is exported public API from `@/lib/repositories`, it is already asserted
 * by name in `tests/unit/repositories.test.ts`, and it is deliberately named after the
 * persistence call so that a log line reads as the query that failed. Renaming
 * `"validators.insert"` to `"validators.create"` would also force `"dataset_entries.list"` to
 * become `"dataset_entries.listActive"` — a second, unrelated public-API change — for no gain.
 * The union is kept, and the two places the names differ are pinned in the maps below instead of
 * being left to prose.
 *
 * Distinctness (no two methods of one interface sharing an operation name) is a runtime assertion
 * in `tests/unit/repositories-supabase.test.ts`; expressing it in the type system would need
 * union-to-tuple gymnastics that cost more to read than the property is worth.
 */

export const DATASET_ENTRIES_OPERATIONS = {
  // Divergence 1 of 2: the method says which entries, the union says which call.
  listActive: "dataset_entries.list",
  findById: "dataset_entries.findById",
  listByIds: "dataset_entries.listByIds",
} as const satisfies Record<keyof DatasetEntriesRepository, RepositoryOperation>;

export const VALIDATORS_OPERATIONS = {
  // Divergence 2 of 2: the method is `create`, the union is named after the persistence call.
  create: "validators.insert",
  findById: "validators.findById",
  touchLastActive: "validators.touchLastActive",
} as const satisfies Record<keyof ValidatorsRepository, RepositoryOperation>;

export const VALIDATIONS_OPERATIONS = {
  insert: "validations.insert",
  findById: "validations.findById",
  findByEntry: "validations.findByEntry",
  // The two coverage reads. `listForEntries` is the one the qualifying predicate is applied to, in
  // the application, by `countQualifyingValidations`; `listEntryIdsForValidator` is an
  // already-answered exclusion read. Neither is a count, which is deliberate: see the note on
  // `countForEntry` in the interface.
  listForEntries: "validations.listForEntries",
  listEntryIdsForValidator: "validations.listEntryIdsForValidator",
  countForEntry: "validations.countForEntry",
  countForValidator: "validations.countForValidator",
} as const satisfies Record<keyof ValidationsRepository, RepositoryOperation>;

export const BATCHES_OPERATIONS = {
  // Divergence 3 of 3, and the same shape as divergence 1: the method names the aggregate, the
  // union names the persistence call on the table.
  create: "validation_batches.insert",
  findById: "validation_batches.findById",
  // `listForRecovery` IS a divergence, of the same shape: the method says which question is being
  // asked, the union names the read on the table. Written `"validation_batches.list"` for the reason
  // the union is named after the table at all, and rejected for the reason above — it would be a
  // FOURTH locally reasonable convention in a union that is meant to have one.
  listForRecovery: "validation_batches.listForRecovery",
} as const satisfies Record<keyof BatchesRepository, RepositoryOperation>;

/**
 * The FOUR divergences are above, and this map has none. `recordAttempt` and `clear` are named
 * after the DOMAIN verb in the interface and the PERSISTENCE verb in the union, and here they happen
 * to read the same way.
 *
 * `clear` is `researcher_signin_attempts.clear` in both places even though it is a DELETE and the
 * union's other entries describe the statement (`insert`, `list`, `findById`). That is a deliberate
 * choice rather than an oversight, and the reason is that both methods of this interface are reached
 * through a Postgres FUNCTION, so "what statement is this" has no honest answer at the seam. Naming
 * them after what the caller asked for keeps the union readable, and both names are still
 * greppable back to a function in the migration.
 */
export const SIGN_IN_ATTEMPTS_OPERATIONS = {
  recordAttempt: "researcher_signin_attempts.recordAttempt",
  clear: "researcher_signin_attempts.clear",
} as const satisfies Record<keyof SignInAttemptsRepository, RepositoryOperation>;
