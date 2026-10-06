import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { RepositoryError } from "@/lib/repositories";
import { runVerifyBatchResponses } from "@/lib/validation/verify-batch-core";
import type { BatchRecord } from "@/schemas/batch";

const BATCH_ID = "VAL_a81d92c1-2026-09-30T20:14:03.117Z";

function batch(entryIds: readonly string[]): BatchRecord {
  return {
    id: BATCH_ID,
    validatorId: "VAL_a81d92c1",
    entries: entryIds.map((datasetEntryId, index) => ({
      datasetEntryId,
      position: index + 1,
    })),
  } as BatchRecord;
}

describe("runVerifyBatchResponses", () => {
  it("verifies complete when every placement has a stored response", async () => {
    const result = await runVerifyBatchResponses(
      { batchId: BATCH_ID },
      {
        batches: { findById: async () => batch(["OD_1", "OD_2"]) },
        validations: { listEntryIdsForValidator: async () => ["OD_1", "OD_2"] },
      },
    );

    expect(result).toEqual({ status: "verified", complete: true, missing: [], total: 2 });
  });

  it("names each missing placement with its position, so the checkpoint can reconcile", async () => {
    const result = await runVerifyBatchResponses(
      { batchId: BATCH_ID },
      {
        batches: { findById: async () => batch(["OD_1", "OD_2", "OD_3"]) },
        validations: { listEntryIdsForValidator: async () => ["OD_1"] },
      },
    );

    expect(result).toEqual({
      status: "verified",
      complete: false,
      missing: [
        { datasetEntryId: "OD_2", position: 2 },
        { datasetEntryId: "OD_3", position: 3 },
      ],
      total: 3,
    });
  });

  it("derives the validator from the stored batch, never from the request", async () => {
    const seen: string[] = [];
    const result = await runVerifyBatchResponses(
      // No validator key exists on the intent: smuggling one is a schema refusal, not a read.
      { batchId: BATCH_ID, validatorId: "VAL_ffffffff" },
      {
        batches: { findById: async () => batch(["OD_1"]) },
        validations: {
          listEntryIdsForValidator: async (validatorId) => {
            seen.push(validatorId);
            return [];
          },
        },
      },
    );

    // The request never reached the read: strictObject refused the extra key first.
    expect(result).toEqual({ status: "failed", reason: "invalid" });
    expect(seen).toEqual([]);
  });

  it("reads completion for the batch's own owner even when others answered the entry", async () => {
    const seen: string[] = [];
    const result = await runVerifyBatchResponses(
      { batchId: BATCH_ID },
      {
        batches: { findById: async () => batch(["OD_1"]) },
        validations: {
          listEntryIdsForValidator: async (validatorId) => {
            seen.push(validatorId);
            return ["OD_1"];
          },
        },
      },
    );

    // Another attempt's response for the same entry must not complete this batch's placement.
    expect(seen).toEqual(["VAL_a81d92c1"]);
    expect(result).toEqual({ status: "verified", complete: true, missing: [], total: 1 });
  });

  it("reports unknown_batch when the batch does not exist, without reading responses", async () => {
    const calls: string[] = [];
    const result = await runVerifyBatchResponses(
      { batchId: BATCH_ID },
      {
        batches: { findById: async () => null },
        validations: {
          listEntryIdsForValidator: async () => {
            calls.push("read");
            return [];
          },
        },
      },
    );

    expect(result).toEqual({ status: "failed", reason: "unknown_batch" });
    expect(calls).toEqual([]);
  });

  it("refuses a malformed batch id before any repository call", async () => {
    const calls: string[] = [];
    const result = await runVerifyBatchResponses(
      { batchId: "" },
      {
        batches: {
          findById: async () => {
            calls.push("batches.findById");
            return null;
          },
        },
        validations: {
          listEntryIdsForValidator: async () => {
            calls.push("validations.listEntryIdsForValidator");
            return [];
          },
        },
      },
    );

    expect(result).toEqual({ status: "failed", reason: "invalid" });
    expect(calls).toEqual([]);
  });

  it("reports a repository failure as persistence", async () => {
    const result = await runVerifyBatchResponses(
      { batchId: BATCH_ID },
      {
        batches: {
          findById: async () => {
            throw new RepositoryError("validation_batches.findById", "connection refused");
          },
        },
        validations: { listEntryIdsForValidator: async () => [] },
      },
    );

    expect(result).toEqual({ status: "failed", reason: "persistence" });
  });
});
