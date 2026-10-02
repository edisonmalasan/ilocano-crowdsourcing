import "server-only";

import {
  RepositoryError,
  type IsoDateTimeString,
  type RepositoryOperation,
  type ValidatorsRepository,
} from "@/lib/repositories";
import {
  validatorProfileSchema,
  type AnonymousValidatorId,
  type ValidatorProfile,
} from "@/schemas/validator";

import type { SupabaseClientLike } from "./client";
import {
  awaitQuery,
  expectNoError,
  parseDomainValue,
  persistenceFailure,
  POSTGREST_UNIQUE_VIOLATION_CODE,
  readRows,
  readSingleRow,
  toIsoDateTime,
} from "./rows";
import { VALIDATORS_OPERATIONS as OPS } from "./operations";

/** The `validators` table as this mapping understands it. Every value is validated, not coerced. */
interface ValidatorRow {
  id: unknown;
  ilocano_proficiency: unknown;
  created_at: unknown;
  last_active_at: unknown;
  total_validations: unknown;
}

/**
 * The five columns, named explicitly. Never `*`.
 *
 * There is deliberately no sixth: the table has no column for a name, email, student id, phone
 * number, address, or social account, and neither the migration nor this mapping has anywhere to
 * put one. That is the anonymity invariant's second, independent half.
 */
const VALIDATOR_COLUMNS = [
  "id",
  "ilocano_proficiency",
  "created_at",
  "last_active_at",
  "total_validations",
] as const satisfies readonly (keyof ValidatorRow)[];

/**
 * Row ⇄ domain translation.
 *
 * `ilocano_proficiency` stays a self-reported screening answer: it is passed through as stored and
 * validated against the five approved values by the schema. Nothing here derives a weight, a rank,
 * or an eligibility flag from it.
 *
 * A SQL `NULL` proficiency becomes the domain's `null`, which the schema explicitly allows for a
 * validator created before or without completing screening.
 */
function toDomain(
  row: Record<string, unknown>,
  context: string,
  operation: RepositoryOperation,
): ValidatorProfile {
  return parseDomainValue(
    validatorProfileSchema,
    {
      id: row.id,
      ilocanoProficiency: row.ilocano_proficiency ?? null,
      createdAt: toIsoDateTime(row.created_at, "created_at", operation),
      lastActiveAt: toIsoDateTime(row.last_active_at, "last_active_at", operation),
      totalValidations: row.total_validations,
    },
    operation,
    context,
  );
}

/** Domain ⇄ row, for the single write this interface has. */
function toRow(profile: ValidatorProfile): Record<string, unknown> {
  return {
    id: profile.id,
    ilocano_proficiency: profile.ilocanoProficiency,
    created_at: profile.createdAt,
    last_active_at: profile.lastActiveAt,
    total_validations: profile.totalValidations,
  };
}

/**
 * Supabase-backed access to anonymous validator profiles.
 *
 * The client is the narrow {@link SupabaseClientLike}, so this is testable with a fake and no
 * network. `factory.ts` is where the real service-role client enters, and it asserts at compile
 * time that the real client still exposes every member of that interface — member names only,
 * for the reason given there.
 *
 * `create` is an INSERT and never an upsert. `upsert` is not even present on the narrow client
 * interface, so a future edit cannot quietly turn "a duplicate id is an error" into "a duplicate id
 * silently overwrites a validator's recorded activity".
 */
export class SupabaseValidatorsRepository implements ValidatorsRepository {
  private readonly client: SupabaseClientLike;

  constructor(client: SupabaseClientLike) {
    this.client = client;
  }

  /**
   * Persists a new anonymous profile. A duplicate ID raises `RepositoryError`; it does not upsert.
   *
   * The stored row is read back and translated rather than the argument being echoed, so what the
   * caller receives is what the database holds. The read-back needs `.select(...)` after the
   * insert, which is a PostgREST behaviour (`Prefer: return=representation`) this code cannot
   * verify without a project; if it ever came back empty, that is raised rather than papered over
   * with the input, because "stored" and "accepted" are different claims.
   */
  async create(profile: ValidatorProfile): Promise<ValidatorProfile> {
    const result = await awaitQuery(OPS.create, "validators.create", () =>
      this.client
        .from("validators")
        .insert(toRow(profile))
        .select(VALIDATOR_COLUMNS.join(","))
        .single(),
    );

    if (result.error !== null) {
      if (result.error.code === POSTGREST_UNIQUE_VIOLATION_CODE) {
        // The primary key is the anonymous id, so a uniqueness violation here is a duplicate id
        // and nothing else. The in-memory fake in `tests/unit/repositories.test.ts` raises the same
        // operation name, so a service cannot tell the two implementations apart by error type.
        throw persistenceFailure(
          OPS.create,
          "validators.create",
          result.error,
          `Validator ${profile.id} already exists. \`create\` does not upsert, so an existing ` +
            "anonymous profile is never overwritten.",
        );
      }
      throw persistenceFailure(OPS.create, "validators.create", result.error);
    }

    const row = readSingleRow(result, OPS.create, "validators.create");
    if (row === null) {
      throw new RepositoryError(
        OPS.create,
        "The insert reported success but returned no stored row, so the write is unconfirmed. " +
          "Echoing the argument back would report a profile as persisted that was never read.",
        { detail: "insert returned no row" },
      );
    }
    return toDomain(row, "validators.create", OPS.create);
  }

  /** The profile with this ID, or `null` when absent. `null` means absent, not failed. */
  async findById(id: AnonymousValidatorId): Promise<ValidatorProfile | null> {
    const result = await awaitQuery(OPS.findById, "validators.findById", () =>
      this.client.from("validators").select(VALIDATOR_COLUMNS.join(",")).eq("id", id).maybeSingle(),
    );
    const row = readSingleRow(result, OPS.findById, "validators.findById");
    return row === null ? null : toDomain(row, "validators.findById", OPS.findById);
  }

  /**
   * Several profiles by ID. Missing IDs are omitted, in caller-asked order.
   *
   * An empty `ids` list short-circuits to `[]` without a query. `.in("id", [])` is not an empty
   * filter, it is a malformed one, so issuing it would turn a legitimately empty request — a
   * dashboard over an entry nobody has touched — into a server error.
   */
  async listByIds(ids: readonly AnonymousValidatorId[]): Promise<ValidatorProfile[]> {
    if (ids.length === 0) return [];

    const result = await awaitQuery(OPS.listByIds, "validators.listByIds", () =>
      this.client.from("validators").select(VALIDATOR_COLUMNS.join(",")).in("id", ids),
    );
    const rows = readRows(result, OPS.listByIds, "validators.listByIds");

    const byId = new Map(
      rows.map((row) => [String(row.id), toDomain(row, "validators.listByIds", OPS.listByIds)]),
    );
    return ids.flatMap((id) => {
      const found = byId.get(id);
      return found ? [found] : [];
    });
  }

  /**
   * Records activity at a caller-supplied timestamp.
   *
   * The timestamp comes from the caller, not from the database clock, so the service — not a
   * client, and not Postgres — owns when activity is deemed to have happened.
   *
   * No `.select()`, so no row comes back and a validator that does not exist updates nothing. That
   * matches the in-memory fake, which returns silently for an unknown id. A missing validator is
   * treated as a no-op rather than a failure: the alternative would make `touchLastActive` throw
   * during teardown of an already-finished session, and the interface asks for `void`.
   */
  async touchLastActive(id: AnonymousValidatorId, at: IsoDateTimeString): Promise<void> {
    const result = await awaitQuery(OPS.touchLastActive, "validators.touchLastActive", () =>
      this.client.from("validators").update({ last_active_at: at }).eq("id", id),
    );
    expectNoError(result, OPS.touchLastActive, "validators.touchLastActive");
  }
}
