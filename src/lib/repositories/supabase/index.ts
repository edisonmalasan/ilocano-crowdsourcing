import "server-only";

/**
 * The Supabase-backed implementation of the repository seam.
 *
 * `import "server-only"` is the first import, as in `@/lib/supabase/admin`: it is what turns
 * "only server code may use this" from a review convention into a build failure when a client
 * component imports it. `@/lib/repositories/supabase` is already in the `PRIVILEGED_SPECIFIERS`
 * list in `eslint.config.mjs`, so the boundary is enforced statically as well.
 *
 * This barrel deliberately does NOT re-export the interfaces or `RepositoryError` from
 * `@/lib/repositories`; those stay imported from the seam, so it remains obvious which half of the
 * contract a caller is using.
 */
export type {
  FilterHandleLike,
  OrderOptionsLike,
  PostgrestErrorLike,
  PostgrestResultLike,
  SelectOptionsLike,
  SupabaseClientLike,
  SupabaseRpcResultLike,
  TableHandleLike,
} from "./client";

export { SupabaseBatchesRepository } from "./batches";
export { SupabaseDatasetEntriesRepository } from "./dataset-entries";
export { SupabaseSignInAttemptsRepository } from "./sign-in-attempts";
export { SupabaseValidatorsRepository } from "./validators";
export { SupabaseValidationsRepository } from "./validations";
export {
  createSignInAttemptsRepository,
  createSupabaseRepositories,
  type SupabaseRepositories,
} from "./factory";
export {
  BATCHES_OPERATIONS,
  DATASET_ENTRIES_OPERATIONS,
  SIGN_IN_ATTEMPTS_OPERATIONS,
  VALIDATIONS_OPERATIONS,
  VALIDATORS_OPERATIONS,
} from "./operations";
