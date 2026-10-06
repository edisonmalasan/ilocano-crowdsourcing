import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { RepositoryError } from "@/lib/repositories";
import type {
  SubmitResponseInput,
  SubmitResponseOutcome,
  ValidationsRepository,
} from "@/lib/repositories";
import { runSubmitResponse } from "@/lib/validation/submit-response-core";

const BATCH_ID = "VAL_a81d92c1-2026-09-30T20:14:03.117Z";
const ENTRY_ID = "OD_1";
const NOW = new Date("2026-10-08T00:00:00.000Z");

function intent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    batchId: BATCH_ID,
    datasetEntryId: ENTRY_ID,
    response: { evaluation: "correct_natural" },
    ...overrides,
  };
}

/** A repository that records every submit call, so refusal-before-write is provable. */
function createRecordingRepository(
  script: SubmitResponseOutcome = {
    status: "recorded",
    responseId: "rsp_01",
    reservationReleased: true,
  },
): { repository: Pick<ValidationsRepository, "submitResponse">; calls: SubmitResponseInput[] } {
  const calls: SubmitResponseInput[] = [];
  return {
    calls,
    repository: {
      submitResponse: async (input: SubmitResponseInput) => {
        calls.push(input);
        return script;
      },
    },
  };
}

const DEPS_NOW = () => NOW;

describe("runSubmitResponse", () => {
  it("records through exactly one RPC with server-minted id and timestamp", async () => {
    const { repository, calls } = createRecordingRepository();

    const result = await runSubmitResponse(intent(), {
      validations: repository,
      now: DEPS_NOW,
    });

    expect(result).toEqual({
      status: "recorded",
      responseId: "rsp_01",
      datasetEntryId: ENTRY_ID,
    });
    // One call, and the caller never supplied the minted facts: the input carries the
    // server's own response id and timestamp, not anything the browser sent.
    expect(calls).toHaveLength(1);
    const sent = calls[0]!;
    expect(sent.batchId).toBe(BATCH_ID);
    expect(sent.datasetEntryId).toBe(ENTRY_ID);
    expect(sent.evaluation).toBe("correct_natural");
    expect(sent.createdAt).toBe(NOW.toISOString());
    expect(typeof sent.responseId).toBe("string");
    expect(sent.responseId.length).toBeGreaterThan(0);
  });

  it("reports the REPOSITORY's response id, not a minted one", async () => {
    const { repository } = createRecordingRepository({
      status: "recorded",
      responseId: "rsp_from_function",
      reservationReleased: false,
    });

    const result = await runSubmitResponse(intent(), {
      validations: repository,
      now: DEPS_NOW,
    });

    // Echoing the minted id back would report a confirmation the database never gave.
    expect(result).toEqual({
      status: "recorded",
      responseId: "rsp_from_function",
      datasetEntryId: ENTRY_ID,
    });
  });

  it("treats already_recorded as synchronized, advancing on the stored answer", async () => {
    const { repository, calls } = createRecordingRepository({
      status: "already_recorded",
      responseId: "rsp_earlier",
      reservationReleased: true,
    });

    const result = await runSubmitResponse(intent(), {
      validations: repository,
      now: DEPS_NOW,
    });

    expect(result).toEqual({ status: "already_recorded", datasetEntryId: ENTRY_ID });
    expect(calls).toHaveLength(1);
  });

  it("maps a refusal to a failure without retrying the same bytes", async () => {
    for (const reason of ["unknown_batch", "not_in_batch"] as const) {
      const { repository, calls } = createRecordingRepository({
        status: "refused",
        reason,
      });

      const result = await runSubmitResponse(intent(), {
        validations: repository,
        now: DEPS_NOW,
      });

      expect(result).toEqual({ status: "failed", reason });
      expect(calls).toHaveLength(1);
    }
  });

  it("refuses a malformed payload before any repository call", async () => {
    const { repository, calls } = createRecordingRepository();

    // `incorrect` without its required correction: the most consequential integrity rule.
    const result = await runSubmitResponse(intent({ response: { evaluation: "incorrect" } }), {
      validations: repository,
      now: DEPS_NOW,
    });

    expect(result.status).toBe("failed");
    if (result.status === "failed") expect(result.reason).toBe("invalid");
    // The count is the claim: asserting only the failure would still pass if the
    // implementation validated AFTER writing.
    expect(calls).toHaveLength(0);
  });

  it("refuses a smuggled validator id, response id, timestamp, or position with nothing written", async () => {
    const { repository, calls } = createRecordingRepository();
    const submit = vi.fn(repository.submitResponse);
    const deps = { validations: { submitResponse: submit }, now: DEPS_NOW };

    const smuggled = [
      intent({ validatorId: "VAL_ffffffff" }),
      intent({ responseId: "rsp_smuggled" }),
      intent({ createdAt: "2020-01-01T00:00:00.000Z" }),
      intent({ position: 3 }),
    ];
    for (const raw of smuggled) {
      const result = await runSubmitResponse(raw, deps);
      expect(result.status).toBe("failed");
      if (result.status === "failed") expect(result.reason).toBe("invalid");
    }
    expect(submit).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it("reports a repository failure as persistence, never as a confirmation", async () => {
    const repository: Pick<ValidationsRepository, "submitResponse"> = {
      submitResponse: async () => {
        throw new RepositoryError("validations.submitResponse", "connection refused");
      },
    };

    const result = await runSubmitResponse(intent(), { validations: repository, now: DEPS_NOW });

    expect(result).toEqual({ status: "failed", reason: "persistence" });
  });

  it("lets a non-repository error escape, because that is a bug", async () => {
    const repository: Pick<ValidationsRepository, "submitResponse"> = {
      submitResponse: async () => {
        throw new TypeError("cannot read properties of undefined");
      },
    };

    await expect(
      runSubmitResponse(intent(), { validations: repository, now: DEPS_NOW }),
    ).rejects.toBeInstanceOf(TypeError);
  });
});
