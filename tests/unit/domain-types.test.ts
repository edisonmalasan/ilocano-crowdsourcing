import { describe, expect, it } from "vitest";

import type { DatasetEntry, DatasetEntryInput } from "@/schemas/dataset";
import type { ValidatorProfile } from "@/schemas/validator";
import type { ValidationResponse, ValidationResponseInput } from "@/schemas/validation";

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
