import "server-only";

import type {
  DatasetEntriesRepository,
  RepositoryOperation,
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
  countForEntry: "validations.countForEntry",
  countForValidator: "validations.countForValidator",
} as const satisfies Record<keyof ValidationsRepository, RepositoryOperation>;
