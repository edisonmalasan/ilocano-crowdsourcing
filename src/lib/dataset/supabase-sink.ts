import type { DatasetEntrySink, DatasetEntryWriteOutcome } from "@/lib/dataset/import-dataset";
import type { ImportedDatasetEntry } from "@/lib/dataset/synthetic-source";
import { RepositoryError } from "@/lib/repositories";
import {
  awaitQuery,
  expectNoError,
  type SupabaseRpcClientLike,
} from "@/lib/repositories/supabase/rpc";

/**
 * The production `DatasetEntrySink`: one database function call per entry.
 *
 * NO `import "server-only"` HERE, AND THE REASON IS A RUNTIME FACT
 * ----------------------------------------------------------------
 * The `server-only` package's entry point throws when it is evaluated outside a React Server
 * Component render, so a module carrying the marker cannot be loaded by a plain-Node process. The
 * caller — `scripts/import-dataset.ts` — is a plain-Node operator command, so this module could not
 * carry the marker. Task 3.3 says to verify that by LOADING the module rather than by reading it,
 * and `tests/unit/dataset-sink-loading.test.ts` does exactly that: it spawns Node against this
 * file's transitive imports and fails if evaluation throws.
 *
 * Nothing is given up by dropping the marker. This module holds no credential, opens no connection,
 * and reads no environment variable: it is handed a client. What it does hold is the ability to
 * name the import function, which is why `@/lib/repositories/supabase/rpc` is a privileged
 * specifier in `eslint.config.mjs` even though its contents warrant no secret.
 *
 * WHY A FUNCTION AND NOT `client.from("dataset_entries").upsert(...)`
 * -----------------------------------------------------------------
 * `src/lib/repositories/supabase/dataset-entries.ts` is a READ interface on purpose — "There is no
 * write method on purpose … imported entries are written by the importer's own upsert path, which is
 * a different concern and is not allowed to be reachable from a request path." This file is that
 * upsert path, and it is a different concern from the read repository for a second reason too: the
 * narrow `TableHandleLike` has no `upsert`, its `insert` takes no options, and PostgREST's own
 * `upsert` would REPLACE `instruction` — the one write this project must never perform.
 *
 * So the atomic, instruction-preserving statement lives in
 * `supabase/migrations/20261003120000_dataset_entries_import.sql` and its versioned successor
 * `supabase/migrations/20261005120000_merged_dataset_provenance.sql`, reached through `rpc`. The
 * immutability guarantee is enforced by the statement's own update list rather than by this file's
 * discipline, which is the stronger of the two claims and the one the research data needs.
 */

/**
 * The database function's name, declared beside its only call site.
 *
 * Declared as a constant so a rename cannot silently become a different string at the call, and so
 * `tests/unit/dataset-sink.test.ts` can assert the function named here is the one the migration
 * creates.
 *
 * v2 carries the provenance arguments (`source_entry_id`, `category_name`) the merged source
 * requires. v1 (`dataset_entries_import`) stays deployed as history; nothing calls it anymore.
 */
export const DATASET_ENTRIES_IMPORT_FUNCTION = "dataset_entries_import_v2";

/**
 * A refusal, reported rather than thrown.
 *
 * The database already refuses a diverging instruction by raising
 * `dataset_entries_instruction_diverged`, and that raise is deliberately visible in the error: an
 * import that continued past a divergence would report "3000 updated" while meaning something else.
 * This sink therefore does NOT catch and convert that refusal into a return value. `design.md` D4
 * requires a re-run that diverges to stop loudly, and the loudest available signal is the database's
 * own named exception reaching the operator's terminal through the command's non-zero exit.
 *
 * So this interface has one method and that method has one failure mode — a thrown `RepositoryError`
 * — and there is no third outcome to represent.
 */
export interface SupabaseDatasetEntrySinkOptions {
  /**
   * `dataset_entries_import_v2` when the caller wants the default. Exposed so a test can prove the
   * default rather than hard-code the string beside its own assertion of the default.
   */
  functionName?: string;
}

/**
 * Writes one parsed entry per call, through the database's own atomic upsert.
 *
 * Depends on `SupabaseRpcClientLike` and NOT on `SupabaseClientLike`, deliberately: the narrower
 * dependency is the one that cannot be used to perform a table write. This sink has no `from`
 * handle, so there is no version of it that could bypass the migration's update list.
 */
export class SupabaseDatasetEntrySink implements DatasetEntrySink {
  private readonly client: SupabaseRpcClientLike;
  private readonly functionName: string;

  constructor(client: SupabaseRpcClientLike, options: SupabaseDatasetEntrySinkOptions = {}) {
    this.client = client;
    this.functionName = options.functionName ?? DATASET_ENTRIES_IMPORT_FUNCTION;
  }

  async upsert(entry: ImportedDatasetEntry): Promise<DatasetEntryWriteOutcome> {
    const context = `Importing dataset entry ${entry.id}`;

    const result = await awaitQuery("dataset_entries.import", context, () =>
      this.client.rpc(this.functionName, {
        p_id: entry.id,
        p_category: entry.category,
        p_source_entry_id: entry.sourceEntryId,
        p_category_name: entry.categoryName,
        p_instruction: entry.instruction,
        p_origin: entry.origin,
        p_destination: entry.destination,
        p_transit_mode: entry.transitMode,
        p_source_payload: entry.sourcePayload,
        p_is_active: true,
      }),
    );

    expectNoError(result, "dataset_entries.import", context);

    return readOutcome(result.data, entry.id);
  }
}

/**
 * Maps the function's return value onto the importer's outcome vocabulary.
 *
 * EXHAUSTIVE BY SWITCH, WITH A THROWING DEFAULT
 * --------------------------------------------
 * The function returns exactly the two strings `'inserted'` and `'updated'`, and this is a closed
 * set — a third value means the deployed function is not the one this file was written against. A
 * `?? "updated"` default would turn that mismatch into a confidently wrong report, and a report that
 * is wrong about how many rows were created is worse than a crash: the operator stops looking. So
 * the default THROWS, and it names the value it received and the entry it belonged to.
 *
 * `switch` with no `default` would not do: an unrecognised value would fall through and return
 * `undefined`, and a promise resolving to `undefined` typed as a string union is precisely the kind
 * of error the type system is supposed to prevent. The `default` is what makes the runtime agree
 * with the type.
 */
function readOutcome(value: unknown, entryId: string): DatasetEntryWriteOutcome {
  switch (value) {
    case "inserted":
      return "inserted";
    case "updated":
      return "updated";
    default:
      throw new RepositoryError(
        "dataset_entries.import",
        `${DATASET_ENTRIES_IMPORT_FUNCTION} returned ${JSON.stringify(value)} for entry ` +
          `${entryId}, which is neither "inserted" nor "updated". The deployed function does not ` +
          "match the one this sink was written against; re-apply the migration before re-running " +
          "the import.",
        { detail: `unrecognised return value ${JSON.stringify(value)}` },
      );
  }
}
