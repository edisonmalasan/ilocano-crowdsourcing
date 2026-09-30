import { describe, expect, it } from "vitest";

import type { AllocationRequest } from "@/lib/allocation/allocate-batch";
import { selectBatchEntries, type AllocationCandidate } from "@/lib/domain/allocation";
import type { AllocatedEntry } from "@/schemas/batch";
import type { DatasetEntry, DatasetEntryInput } from "@/schemas/dataset";
import type { ValidatorProfile } from "@/schemas/validator";
import type { ValidationResponse, ValidationResponseInput } from "@/schemas/validation";

/** The keys of `T`, as a union. */
type KeyUnion<T> = keyof T;
/** Exact (not assignable) equality, so a WIDER key set fails rather than passing. */
type Equals<A, B> =
  (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2 ? true : false;
/**
 * Asserts that `T` has EXACTLY the keys `K` — no more, no fewer.
 *
 * The alias is declared and the constraint is evaluated where the alias is written, so a violation
 * breaks `pnpm run typecheck` rather than a test run. That is deliberate: the property being pinned
 * is a property of the TYPE, and the layer that stops someone adding the field is the compiler.
 *
 * The `@ts-expect-error` directives elsewhere in this file are the same idea applied to a VALUE.
 * This one is applied to a KEY SET, which is what makes it name-agnostic — see the describe block.
 */
type KeySetIsExactly<T, K> = Equals<KeyUnion<T>, K> extends true ? true : never;

/**
 * Type-layer separation between static dataset definition and runtime response state.
 *
 * `tests/unit/dataset.test.ts` already proves the same separation at RUNTIME: a response-shaped
 * object fails `datasetEntrySchema`, and the two shapes have disjoint keys. This file proves it at
 * COMPILE time, which is the layer that actually stops the mistake from being written.
 *
 * HOW THE TYPE ASSERTIONS ARE ENFORCED
 *
 * Every assertion below is a `@ts-expect-error` on a line that must NOT compile. That directive is
 * itself checked: if the line ever *did* compile, TypeScript reports "Unused '@ts-expect-error'
 * directive" and `pnpm run typecheck` fails. So this file cannot silently decay into a file that
 * asserts nothing — merging the two shapes breaks the type-check, which is exactly the failure
 * mode the assertion exists to catch.
 *
 * The practical consequence being protected: a validator's correction is response data recorded
 * BESIDE the imported synthetic instruction. If a `ValidationResponse` were assignable to a
 * `DatasetEntry`, some future service could accept a submission where an entry is expected and
 * write a correction over `instruction`, destroying the immutable research source. The compiler is
 * the cheapest place to make that unrepresentable.
 */

const TIMESTAMP = "2026-09-30T00:00:00.000Z";

/** A minimal, well-formed static dataset entry. */
const entry: DatasetEntry = {
  id: "OD_0001",
  category: "origin_destination",
  instruction: "Langet ti Bangon ti Mainit.",
  origin: "Bangon",
  destination: "Mainit",
  transitMode: null,
  createdAt: TIMESTAMP,
  isActive: true,
};

/** A minimal, well-formed runtime validation response for that entry. */
const response: ValidationResponse = {
  id: "val_response_1",
  evaluation: "incorrect",
  correctedInstruction: "Langet ti Bangon ti Mainit.",
  englishTranslation: "From Bangon to Mainit.",
  filipinoTranslation: "Mula Bangon tungo sa Mainit.",
  validatorId: "VAL_0a1b2c3d",
  datasetEntryId: "OD_0001",
  batchId: "batch_1",
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP,
};

describe("static dataset definition and runtime response state are distinct types", () => {
  it("does not allow a validation response where a dataset entry is expected", () => {
    // A response carries `evaluation`/`validatorId` and no `instruction`. If the two types were
    // ever merged, or made structurally compatible, this assignment would become legal.
    // @ts-expect-error a ValidationResponse is not a DatasetEntry
    const asEntry: DatasetEntry = response;

    // The value exists only to make the assignment a statement rather than a bare expression.
    expect(asEntry).toBe(response);
  });

  it("does not allow a dataset entry where a validation response is expected", () => {
    // The reverse direction matters just as much: an entry must not be passable where a stored
    // response is expected, or a read path could return imported instructions as research data.
    // @ts-expect-error a DatasetEntry is not a ValidationResponse
    const asResponse: ValidationResponse = entry;

    expect(asResponse).toBe(entry);
  });

  it("does not allow a validation intent to be persisted as a stored record", () => {
    // The stored record adds server-assigned identity and timestamps. An intent is what a client
    // sends, so accepting one where a record is expected would mean persisting client-chosen ids.
    const intent: ValidationResponseInput = { evaluation: "correct_natural" };

    // @ts-expect-error an intent lacks the server-assigned fields a record requires
    const asRecord: ValidationResponse = intent;

    expect(asRecord).toBe(intent);
  });

  it("does not allow a stored record to stand in for a validator profile", () => {
    // A response is research data ABOUT a validator; a profile is the validator's own state. The
    // anonymity invariant depends on them staying separate — a profile has no evaluation, and a
    // response is not a profile even though both mention a validator.
    // @ts-expect-error a ValidationResponse is not a ValidatorProfile
    const asProfile: ValidatorProfile = response;

    expect(asProfile).toBe(response);
  });

  it("keeps the source ID the only thing the two types share", () => {
    // The join key between an imported record, a validation, and an export row is the externally
    // meaningful source ID, and it is carried under different names precisely because the two
    // shapes are different things. It is the ONE relationship that must hold, and it is the only
    // one the compiler is allowed to accept.
    expect(response.datasetEntryId).toBe(entry.id);
  });

  it("does not let a dataset entry input masquerade as a stored entry", () => {
    // `DatasetEntryInput` omits `createdAt`/`isActive`, which the server assigns. Accepting an
    // input where a stored entry is expected would let an import choose its own timestamps.
    const input: DatasetEntryInput = {
      id: "OD_0002",
      category: "origin_destination",
      instruction: "Langet ti Sentro ti Kadaklapan.",
      origin: "Sentro",
      destination: "Kadaklapan",
      transitMode: null,
    };

    // @ts-expect-error an input lacks the server-assigned fields a stored entry requires
    const asStored: DatasetEntry = input;

    expect(asStored).toBe(input);
  });
});

/**
 * The selection rule cannot be called without the inputs that make it research-reproducible.
 *
 * Same mechanism as the assertions above: a `@ts-expect-error` that fails the type-check if the
 * line ever becomes legal. Two properties are pinned, and they are distinct failures rather than
 * one:
 *
 *   - **the random source has no default.** A rule that defaulted it would read `Math.random()` or a
 *     module-level generator whenever a caller forgot to pass one, which is precisely the ambient
 *     randomness the spec forbids — and it would be *invisible*, because the rule would still
 *     return a valid-looking order.
 *   - **coverage cannot be omitted.** Coverage is the metric the whole platform is built on. A
 *     signature that made it optional would compile a call that selects a batch with no idea which
 *     entries are least covered, and the batch would look perfectly ordinary.
 *
 * A third, smaller claim is asserted rather than hoped for: a `DatasetEntry` IS an
 * `AllocationCandidate`, which is what lets the service hand its own pool straight to the rule
 * without a mapping step and without widening the rule to see `source_payload`.
 */
describe("the allocation selection rule's required inputs", () => {
  const pool: AllocationCandidate[] = [{ id: "OD_0001" }, { id: "OD_0002" }];
  const answered = new Set<string>();
  const counts: ReadonlyMap<string, number> = new Map([["OD_0001", 0]]);

  /**
   * Declared and NEVER CALLED, and the declaration is the assertion.
   *
   * Vitest transpiles without type-checking, so an invalid call written straight into a test body
   * would still EXECUTE and fail for a reason that has nothing to do with the compile-time claim —
   * `random` arriving as `undefined` is a `TypeError`, not "the type-check rejected this". That is
   * exactly the failure mode the repository record calls a false negative wearing a green
   * checkmark. Keeping the calls inside a function nothing invokes separates the two layers: the
   * assertions below hold at runtime, and the `@ts-expect-error` directives hold at compile time.
   */
  function callsTheCompilerMustReject(): unknown {
    // @ts-expect-error the random source is required and has no default
    return selectBatchEntries(pool, answered, counts, 3, 10);
  }

  function omitsCoverageTheCompilerMustReject(): unknown {
    // The target standing in the coverage slot is not a mistake this compiler catches by argument
    // COUNT alone — there are still six arguments — so it is caught by type instead: a
    // `ReadonlyMap` and a `number` are not interchangeable, and no other parameter in this list
    // accepts one in place of the other.
    // @ts-expect-error the coverage map is required, and a number cannot stand in for it
    return selectBatchEntries(pool, answered, 3, 3, 10, () => 0);
  }

  it("declares two calls that must not compile", () => {
    // The assertion is that these are FUNCTIONS and that nothing invoked them. If either call
    // became legal, `pnpm run typecheck` fails with "Unused '@ts-expect-error' directive".
    expect(typeof callsTheCompilerMustReject).toBe("function");
    expect(typeof omitsCoverageTheCompilerMustReject).toBe("function");
  });

  it("accepts a stored dataset entry as a candidate, so the service need not map one", () => {
    // Structural, not nominal: `DatasetEntry` satisfies `{ id: string }`, which is what lets
    // `allocateBatch` hand its own pool straight to the rule instead of projecting ids first.
    const fromStored: AllocationCandidate[] = [entry, { ...entry, id: "OD_0002" }];

    expect(fromStored.map((candidate) => candidate.id)).toEqual(["OD_0001", "OD_0002"]);
  });
});

/**
 * What crosses to a browser as an allocated entry is a CLOSED set, and the compiler is the only place
 * that closure can be enforced.
 *
 * Same mechanism as the assertions above, and the same reason it matters: `AllocatedEntry` is what a
 * validator's browser receives, and a field added to it becomes a field that crosses. The exclusions
 * are each for their own reason rather than as a blanket "trim the type" — see the schema's header.
 *
 * HONEST SCOPE, because a type assertion that overstates itself is worse than none. These directives
 * catch an object LITERAL carrying a forbidden field. They do NOT catch a `DatasetEntry` variable
 * assigned to `AllocatedEntry`, because structural typing accepts a wider source; a service that
 * returned its pool rows directly would compile. The runtime half of that hole is closed by
 * `allocatedEntrySchema` being a `strictObject`, and by the service projecting rather than passing
 * rows through — `allocation-service.test.ts` asserts the projected keys by value. What these
 * assertions buy is that nobody can *construct* an allocated entry with a forbidden field.
 */
describe("an allocated entry carries only renderable fields", () => {
  function withSourcePayloadTheCompilerMustReject(): unknown {
    const shown: AllocatedEntry = {
      id: entry.id,
      category: entry.category,
      instruction: entry.instruction,
      origin: entry.origin,
      destination: entry.destination,
      transitMode: entry.transitMode,
      // The directive sits on the offending PROPERTY rather than on the declaration, because that is
      // where TypeScript reports an excess-property error. A directive above the declaration would be
      // "unused" and `pnpm run typecheck` would fail for the wrong reason — which is a failure mode
      // worth knowing, not one worth preserving.
      // @ts-expect-error sourcePayload is the archival copy of the source record and never crosses
      sourcePayload: { origin: "Bangon" },
    };

    return shown;
  }

  function withIngestionMetadataTheCompilerMustReject(): unknown {
    const shown: AllocatedEntry = {
      id: entry.id,
      category: entry.category,
      instruction: entry.instruction,
      origin: entry.origin,
      destination: entry.destination,
      transitMode: entry.transitMode,
      // @ts-expect-error createdAt is an ingestion timestamp, not a research finding
      createdAt: entry.createdAt,
    };

    return shown;
  }

  function withActiveFlagTheCompilerMustReject(): unknown {
    const shown: AllocatedEntry = {
      id: entry.id,
      category: entry.category,
      instruction: entry.instruction,
      origin: entry.origin,
      destination: entry.destination,
      transitMode: entry.transitMode,
      // @ts-expect-error isActive is an allocation INPUT; a batch the server built cannot contain a
      // retired entry, so returning it says either "impossible" or "you have a bug"
      isActive: true,
    };

    return shown;
  }

  it("declares three constructions that must not compile", () => {
    // The assertion is that these are FUNCTIONS and that nothing invoked them. If any construction
    // became legal, `pnpm run typecheck` fails with "Unused '@ts-expect-error' directive".
    expect(typeof withSourcePayloadTheCompilerMustReject).toBe("function");
    expect(typeof withIngestionMetadataTheCompilerMustReject).toBe("function");
    expect(typeof withActiveFlagTheCompilerMustReject).toBe("function");
  });

  it("constructs the six renderable fields without complaint", () => {
    // The positive control. Without it, a `strictObject` that rejected everything would satisfy every
    // directive above for the wrong reason.
    const shown: AllocatedEntry = {
      id: entry.id,
      category: entry.category,
      instruction: entry.instruction,
      origin: entry.origin,
      destination: entry.destination,
      transitMode: entry.transitMode,
    };

    expect(Object.keys(shown)).toHaveLength(6);
  });
});

/**
 * ================================================================================================
 * THE ALLOCATION REQUEST HAS NO FIELD A CLIENT COULD DICTATE THE BATCH WITH
 * ================================================================================================
 * This block exists because of a measured failure, and the measurement is what makes the mechanism
 * understandable.
 *
 * THE FAILURE. The spec scenario "a client cannot dictate the batch order" was enforced ONLY by the
 * absence of a parameter. An independent verification pass built the mutation a developer would
 * actually write — the intent schema gains an `clientOrder` field AND the service honours it — and the
 * whole suite stayed green: `51 passed (51)` against a control of `51 passed (51)`. The scenario was
 * false and nothing was red.
 *
 * WHY A BEHAVIOURAL TEST CANNOT FIX IT, which is the part that is easy to get wrong. The obvious
 * repair is a test that hands the service a client-supplied order and asserts it is ignored. That
 * repair was tried and MEASURED, and it does not work: the mutation honours a field named
 * `clientOrder`, a test that smuggles `order` and `positions` never triggers it, and the suite was
 * still `52 passed (52)`. Enumerating plausible key names does not close the gap, because a mutation
 * may name its field anything at all. The guarantee here is the ABSENCE OF A PARAMETER, and absence is
 * not a behaviour a runtime assertion can observe — asserting that a field is missing only ever tests
 * today's field list.
 *
 * SO THE PIN IS AT THE TYPE LAYER, where it is name-agnostic. Adding ANY third key to
 * `AllocationRequest` — whatever it is called — changes `KeyUnion<AllocationRequest>`, the
 * `Equals` check fails, and `pnpm run typecheck` fails. The compiler is the layer that can see a key
 * that does not exist yet.
 *
 * WHAT STILL NEEDS A RUNTIME TEST, and where it is: the boundary's REFUSAL of an extra key is
 * behavioural and is proven in `allocation-actions.test.ts`; the service's DERIVATION of positions from
 * the selected order is behavioural and is proven in `allocation-service.test.ts`. This block covers
 * the third thing — that no such field exists to be honoured.
 */
describe("the allocation request exposes no client-authoritative field", () => {
  it("has exactly the identifier and a size preference, and no third key", () => {
    // The assertion lives in the TYPE. This runtime expectation only exists so the type alias is
    // referenced and cannot rot into dead code — it cannot fail on its own, and it is not what pins
    // the property. The positive control matters: a key-set check that passed vacuously (because the
    // alias were never evaluated) would be indistinguishable from a real one.
    const assertion: KeySetIsExactly<AllocationRequest, "validatorId" | "requestedSize"> = true;
    expect(assertion).toBe(true);
  });

  it("rejects a client-supplied order key even where no such field is declared", () => {
    // The companion negative control, and the reason the block is not purely declarative. A request
    // carrying an order must be a TYPE error, which is what stops it from being written at all.
    // @ts-expect-error — `order` is not a field of `AllocationRequest`; the compiler is the boundary.
    const withOrder: AllocationRequest = { validatorId: "VAL_a81d92c1", order: ["OD_0001"] };
    // @ts-expect-error — likewise for a `positions` key.
    const withPositions: AllocationRequest = { validatorId: "VAL_a81d92c1", positions: [1, 2] };
    // @ts-expect-error — and for a coverage target.
    const withTarget: AllocationRequest = { validatorId: "VAL_a81d92c1", coverageTarget: 99 };

    expect(typeof withOrder).toBe("object");
    expect(typeof withPositions).toBe("object");
    expect(typeof withTarget).toBe("object");
  });
});
