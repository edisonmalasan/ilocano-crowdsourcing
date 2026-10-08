import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { RepositoryError, type DatasetEntriesRepository } from "@/lib/repositories";
import type {
  OwnedSessionThrottleContext,
  OwnedValidationSessionDependencies,
} from "@/lib/validation/session-service";
import type {
  OwnedSessionRequestKeysAreExactlyTheseThree,
  ValidationSessionOutcome,
} from "@/lib/validation/session";
import { batchRecordSchema } from "@/schemas/batch";
import type { OwnedSessionGatePropsAreExactlyTheseFour } from "@/app/validate/[batchId]/owned-session-gate";

vi.mock("server-only", () => ({}));

async function loadService() {
  return import("@/lib/validation/session-service");
}

/**
 * The type-level pin on the owned request's key set: the request carries its
 * batch, an optional position, and the active attempt — and nothing else. A
 * fourth key under ANY name (a `validatorId`-as-override beside
 * `activeAttemptId`, a `clientOrder`, anything) resolves the excluded set to
 * a non-`never` and fails `pnpm run typecheck` at this line.
 */
const ownedRequestKeyPin: OwnedSessionRequestKeysAreExactlyTheseThree = true;

/**
 * The type-level pin on the gate's prop key set: exactly `locale`,
 * `batchId`, `position`, and the bound action. A fifth prop under ANY name
 * — an attempt carried from server to client — fails typecheck here.
 */
const gatePropsPin: OwnedSessionGatePropsAreExactlyTheseFour = true;

const OWNER = "VAL_720f59cd";
const FOREIGN = "VAL_0a1b2c3d";
const LEGACY_BATCH = "VAL_720f59cd-2026-10-02T19:46:56.320Z";
const NEW_ATTEMPT = "VAL_0123456789abcdef0123456789abcdef";
const NEW_BATCH = "BAT_0123456789abcdef0123456789abcdef";
const NOW = "2026-09-30T12:00:00.000Z";

interface GateOptions {
  readonly batch?: unknown;
  readonly completedEntryIds?: readonly string[];
  readonly batchFailure?: unknown;
  readonly lifetimeAnsweredCount?: number | null;
  readonly throttleContext?: OwnedSessionThrottleContext;
}

interface Recording extends OwnedValidationSessionDependencies {
  readonly calls: string[];
}

function createRecording(over: GateOptions = {}): Recording {
  const calls: string[] = [];
  type StoredEntry = NonNullable<Awaited<ReturnType<DatasetEntriesRepository["findById"]>>>;
  const entries: Record<string, StoredEntry> = {
    OD_1: storedEntry("OD_1", "Iti Baguio Athletic Bowl ti ayanko ita.") as StoredEntry,
  };

  return {
    calls,
    ...(over.throttleContext !== undefined ? { throttleContext: over.throttleContext } : {}),
    batches: {
      async findById(id: string) {
        calls.push(`batches.findById:${id}`);
        if (over.batchFailure !== undefined) throw over.batchFailure;
        if (over.batch === null) return null;
        const record = over.batch ?? {
          id,
          validatorId: OWNER,
          entries: [{ datasetEntryId: "OD_1", position: 1 }],
        };
        return batchRecordSchema.parse(record);
      },
    },
    validations: {
      async listEntryIdsForValidator(validatorId: string) {
        calls.push(`validations.listEntryIdsForValidator:${validatorId}`);
        return [...(over.completedEntryIds ?? [])];
      },
      async countForValidator(validatorId: string) {
        calls.push(`validations.countForValidator:${validatorId}`);
        return over.lifetimeAnsweredCount ?? (over.completedEntryIds ?? []).length;
      },
    },
    datasetEntries: {
      async findById(id: string) {
        calls.push(`datasetEntries.findById:${id}`);
        return entries[id] ?? null;
      },
    },
  };
}

function storedEntry(id: string, instruction: string): Record<string, unknown> {
  return {
    id,
    category: "origin_destination",
    sourceEntryId: Number(id.split("_").pop()),
    categoryName: "Origin + Destination",
    instruction,
    origin: "Baguio",
    destination: "Baguio",
    transitMode: "jeepney",
    sourcePayload: { record_id: id },
    createdAt: NOW,
  };
}

/** An always-allowing throttle, for the tests where pacing is not the subject. */
function allowAll(): OwnedSessionThrottleContext {
  return { throttle: { check: () => true }, originKey: "test-origin" };
}

/** An always-refusing throttle: the burst the spec paces. */
function refuseAll(): OwnedSessionThrottleContext {
  return { throttle: { check: () => false }, originKey: "test-origin" };
}

describe("the owned-request key pin is live", () => {
  it("holds, so a fourth request key would fail typecheck", () => {
    expect(ownedRequestKeyPin).toBe(true);
  });
});

describe("the route never carries the attempt identity", () => {
  /** Code lines only: the files document the guarantee in prose beside the code. */
  function codeLinesOf(file: string): string {
    return readFileSync(file, "utf8")
      .split("\n")
      .filter((line: string) => {
        const trimmed = line.trim();
        return trimmed !== "" && !trimmed.startsWith("//") && !trimmed.startsWith("*");
      })
      .join("\n");
  }

  it("spells no VAL_ literal in the route page or the gate", () => {
    // The attempt travels in the gated action's BODY, never in the address.
    // A literal in code would be an identifier (or its shape) baked into the
    // route — into history, logs, or the address bar. Comments may discuss
    // the guarantee; code may not carry the value.
    for (const file of [
      "src/app/validate/[batchId]/page.tsx",
      "src/app/validate/[batchId]/owned-session-gate.tsx",
    ]) {
      expect(codeLinesOf(file), `${file} carries an attempt-shaped literal`).not.toMatch(/VAL_/);
    }
  });

  it("hands the gate the batch half only; the attempt half is never a prop", () => {
    // A prop carrying the attempt from server to client would put the
    // identity in the server render. The gate reads it from session-scoped
    // storage at proof time instead. Pinned at the type layer beside the
    // request key sets: any fifth prop under ANY name fails typecheck at the
    // assertion below, which is the layer that can see a key that does not
    // exist yet. The page half is asserted by construction — the gate call
    // passes `batchId`, `position`, and the bound action, and nothing else.
    expect(gatePropsPin).toBe(true);
  });
});
describe("openOwnedValidationSession", () => {
  it("opens the current entry for the owning session", async () => {
    const { openOwnedValidationSession } = await loadService();
    const deps = createRecording({ throttleContext: allowAll() });

    const outcome = await openOwnedValidationSession(
      { batchId: LEGACY_BATCH, activeAttemptId: OWNER },
      deps,
    );

    expect(outcome.status).toBe("presenting");
    if (outcome.status === "presenting") {
      expect(outcome.session.batchId).toBe(LEGACY_BATCH);
      expect(outcome.session.entry.instruction).toBe("Iti Baguio Athletic Bowl ti ayanko ita.");
    }
  });

  it("serves a new-shape BAT_ batch to its 32-hex owner", async () => {
    const { openOwnedValidationSession } = await loadService();
    const deps = createRecording({
      throttleContext: allowAll(),
      batch: {
        id: NEW_BATCH,
        validatorId: NEW_ATTEMPT,
        entries: [{ datasetEntryId: "OD_1", position: 1 }],
      },
    });

    const outcome = await openOwnedValidationSession(
      { batchId: NEW_BATCH, activeAttemptId: NEW_ATTEMPT },
      deps,
    );

    expect(outcome.status).toBe("presenting");
  });

  it("redirects a foreign attempt home with no sentence and no further reads", async () => {
    const { openOwnedValidationSession } = await loadService();
    const deps = createRecording({ throttleContext: allowAll() });

    const outcome = await openOwnedValidationSession(
      { batchId: LEGACY_BATCH, activeAttemptId: FOREIGN },
      deps,
    );

    expect(outcome).toEqual({ status: "redirectHome" });
    expect(JSON.stringify(outcome)).not.toMatch(/Baguio|ayanko/);
    // The batch lookup ran (it must, to learn the owner); nothing past the
    // comparison did — no completed set, no entry read, no count.
    expect(deps.calls).toEqual([`batches.findById:${LEGACY_BATCH}`]);
  });

  it("reports an unknown batch EXACTLY like a foreign attempt", async () => {
    const { openOwnedValidationSession } = await loadService();
    const foreignDeps = createRecording({ throttleContext: allowAll() });
    const unknownDeps = createRecording({ batch: null, throttleContext: allowAll() });

    const foreign = await openOwnedValidationSession(
      { batchId: LEGACY_BATCH, activeAttemptId: FOREIGN },
      foreignDeps,
    );
    const unknown = await openOwnedValidationSession(
      { batchId: "BAT_ffffffffffffffffffffffffffffffff", activeAttemptId: OWNER },
      unknownDeps,
    );

    // The indistinguishability the spec requires, asserted as value equality:
    // a prober comparing the two responses learns nothing.
    expect(unknown).toEqual(foreign);
    expect(unknown).toEqual({ status: "redirectHome" });
  });

  it("redirects a malformed attempt home without any read", async () => {
    const { openOwnedValidationSession } = await loadService();
    const deps = createRecording({ throttleContext: allowAll() });

    const outcome = await openOwnedValidationSession(
      { batchId: LEGACY_BATCH, activeAttemptId: "not-an-attempt" },
      deps,
    );

    expect(outcome).toEqual({ status: "redirectHome" });
    expect(deps.calls).toEqual([]);
  });

  it("redirects an absent attempt home without any read", async () => {
    const { openOwnedValidationSession } = await loadService();
    const deps = createRecording({ throttleContext: allowAll() });

    const outcome = await openOwnedValidationSession({ batchId: LEGACY_BATCH }, deps);

    expect(outcome).toEqual({ status: "redirectHome" });
    expect(deps.calls).toEqual([]);
  });

  it("compares against the STORED owner and never parses the batch identifier", async () => {
    const { openOwnedValidationSession } = await loadService();
    // The legacy batch string names FOREIGN, but the STORED owner is OWNER.
    // A gate that parsed the identifier would admit FOREIGN and refuse OWNER.
    const deps = createRecording({
      throttleContext: allowAll(),
      batch: {
        id: `VAL_${FOREIGN.slice(4)}-2026-10-02T19:46:56.320Z`,
        validatorId: OWNER,
        entries: [{ datasetEntryId: "OD_1", position: 1 }],
      },
    });

    const ownerOutcome = await openOwnedValidationSession(
      { batchId: `VAL_${FOREIGN.slice(4)}-2026-10-02T19:46:56.320Z`, activeAttemptId: OWNER },
      deps,
    );
    const embeddedOutcome = await openOwnedValidationSession(
      { batchId: `VAL_${FOREIGN.slice(4)}-2026-10-02T19:46:56.320Z`, activeAttemptId: FOREIGN },
      createRecording({
        throttleContext: allowAll(),
        batch: {
          id: `VAL_${FOREIGN.slice(4)}-2026-10-02T19:46:56.320Z`,
          validatorId: OWNER,
          entries: [{ datasetEntryId: "OD_1", position: 1 }],
        },
      }),
    );

    expect(ownerOutcome.status).toBe("presenting");
    expect(embeddedOutcome).toEqual({ status: "redirectHome" });
  });

  it("reads the completed set and counts against the STORED owner", async () => {
    const { openOwnedValidationSession } = await loadService();
    const deps = createRecording({ throttleContext: allowAll() });

    await openOwnedValidationSession({ batchId: LEGACY_BATCH, activeAttemptId: OWNER }, deps);

    expect(deps.calls).toContain(`validations.listEntryIdsForValidator:${OWNER}`);
    expect(deps.calls).not.toContain(`validations.listEntryIdsForValidator:${FOREIGN}`);
  });

  it("finishes through the gate with the lifetime figure for a completed batch", async () => {
    const { openOwnedValidationSession } = await loadService();
    const deps = createRecording({
      throttleContext: allowAll(),
      completedEntryIds: ["OD_1"],
      lifetimeAnsweredCount: 7,
    });

    const outcome = await openOwnedValidationSession(
      { batchId: LEGACY_BATCH, activeAttemptId: OWNER },
      deps,
    );

    expect(outcome).toEqual({
      status: "finished",
      batchId: LEGACY_BATCH,
      completedCount: 1,
      total: 1,
      lifetimeAnsweredCount: 7,
    });
  });

  it("redirects home when the throttle refuses, before any read", async () => {
    const { openOwnedValidationSession } = await loadService();
    const deps = createRecording({ throttleContext: refuseAll() });

    const outcome = await openOwnedValidationSession(
      { batchId: LEGACY_BATCH, activeAttemptId: OWNER },
      deps,
    );

    expect(outcome).toEqual({ status: "redirectHome" });
    expect(deps.calls).toEqual([]);
  });

  it("paces the check on the ATTEMPTED identity, not only on well-formed ones", async () => {
    const { openOwnedValidationSession } = await loadService();
    const seen: Array<{ attempt: string | undefined }> = [];
    const deps = createRecording({
      throttleContext: {
        throttle: {
          check: (_action, _origin, attempt) => {
            seen.push({ attempt });
            return true;
          },
        },
        originKey: "test-origin",
      },
    });

    await openOwnedValidationSession(
      { batchId: LEGACY_BATCH, activeAttemptId: "VAL_ffffffff" },
      deps,
    );

    // Even a well-formed-but-foreign attempt reaches the throttle with its
    // own identity component, so a guessing run cannot share one budget.
    expect(seen).toEqual([{ attempt: "VAL_ffffffff" }]);
  });

  it("reports a read failure as persistence, NOT as a quiet trip home", async () => {
    const { openOwnedValidationSession } = await loadService();
    const deps = createRecording({
      throttleContext: allowAll(),
      batchFailure: new RepositoryError("validation_batches.findById", "select failed"),
    });

    const outcome = await openOwnedValidationSession(
      { batchId: LEGACY_BATCH, activeAttemptId: OWNER },
      deps,
    );

    // During normal operation every probe of every nonexistent batch gets
    // `redirectHome`, so the failure case carries no existence signal — while
    // an outage still reports as an outage rather than a redirect.
    expect(outcome).toEqual({ status: "failed", reason: "persistence" });
  });

  it("performs no enrollment write on any path", async () => {
    const { openOwnedValidationSession } = await loadService();
    // The dependency interface carries no write method at all: batches,
    // completed sets, counts, and entries are reads, and there is nowhere
    // for a validator creation to hide. Asserted on the key set, so a new
    // write capability added to the interface fails here.
    const outcomes: ValidationSessionOutcome[] = [];
    const ownerDeps = createRecording({ throttleContext: allowAll() });
    outcomes.push(
      await openOwnedValidationSession(
        { batchId: LEGACY_BATCH, activeAttemptId: OWNER },
        ownerDeps,
      ),
    );
    const foreignDeps = createRecording({ throttleContext: allowAll() });
    outcomes.push(
      await openOwnedValidationSession(
        { batchId: LEGACY_BATCH, activeAttemptId: FOREIGN },
        foreignDeps,
      ),
    );

    // The dependency interface carries no write method at all: batches,
    // completed sets, counts, and entries are reads, and there is nowhere
    // for a validator creation to hide. Asserted on what the gate ASKED for,
    // so a write smuggled into any path fails here.
    const writes = [...ownerDeps.calls, ...foreignDeps.calls].filter((call) =>
      /create|insert|update|delete|enroll/i.test(call),
    );
    expect(writes).toEqual([]);
    expect(outcomes.map((outcome) => outcome.status)).toEqual(["presenting", "redirectHome"]);
  });
});
