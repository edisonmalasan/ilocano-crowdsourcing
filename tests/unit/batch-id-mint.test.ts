import { describe, expect, it, vi } from "vitest";

import {
  BATCH_ID_PATTERN,
  createBatchId,
  defaultBatch,
  defaultBatchId,
} from "@/lib/allocation/allocate-batch";
import { createAnonymousValidatorId } from "@/lib/domain/anonymous-validator-id";
import type { AnonymousValidatorId } from "@/schemas/validator";

/**
 * The independent opaque batch mint (OpenSpec `attempt-and-batch-capability-hardening` 2.2).
 *
 * New batch IDs are `BAT_` + 32 lowercase hex (16 CSPRNG bytes, 128 bits), drawn fresh
 * from the CSPRNG at batch creation — never derived from the validator ID, the creation
 * instant, entry IDs, or a counter. The `validatorId-timestamp` construction is retired
 * for new batches. `validator_id` and `created_at` remain separate stored facts.
 *
 * What this file proves:
 *
 *   - the mint produces exactly the contract shape, from exactly 16 CSPRNG bytes;
 *   - a minted ID contains neither the owner's identifier nor the creation instant, and
 *     two mints from identical inputs differ (independence, not concealment);
 *   - an unreachable CSPRNG throws rather than producing a predictable identifier;
 *   - the identifiers carry no URL-reserved characters, so the exact-once-decode route
 *     round trip holds trivially;
 *   - `defaultBatch` still pairs the minted ID with the single injected `Date` for
 *     `createdAt`, and `defaultBatchId` keeps its two-argument signature for existing
 *     callers while minting the new shape.
 */

/**
 * `server-only` cannot be imported under Vitest, so the module marker is stubbed here. The
 * boundary it protects is asserted separately by `tests/unit/supabase-clients.test.ts`,
 * which deliberately does NOT stub it.
 */
vi.mock("server-only", () => ({}));

const OWNER = "VAL_0123456789abcdef0123456789abcdef" as AnonymousValidatorId;
const INSTANT = "2026-09-30T20:14:03.117Z";

function withCryptoStub(stub: unknown, run: () => void): void {
  vi.stubGlobal("crypto", stub);
  try {
    run();
  } finally {
    vi.unstubAllGlobals();
  }
}

describe("the opaque batch mint", () => {
  it("mints BAT_ plus 32 lowercase hex characters", () => {
    const id = createBatchId();

    expect(id).toMatch(BATCH_ID_PATTERN);
    expect(id).toHaveLength(36);
  });

  it("pins the batch pattern to the contract shape exactly", () => {
    expect(BATCH_ID_PATTERN.source).toBe("^BAT_[0-9a-f]{32}$");
  });

  it("draws exactly 16 CSPRNG bytes per mint and renders them as hex", () => {
    const seenLengths: number[] = [];
    withCryptoStub(
      {
        getRandomValues(array: Uint8Array): Uint8Array {
          seenLengths.push(array.length);
          array.fill(0x07);
          return array;
        },
      },
      () => {
        expect(createBatchId()).toBe(`BAT_${"07".repeat(16)}`);
      },
    );

    expect(seenLengths).toEqual([16]);
  });

  it("fails closed when no CSPRNG is reachable", () => {
    withCryptoStub({}, () => {
      expect(() => createBatchId()).toThrow(/Web Crypto/);
    });
  });

  it("carries no URL-reserved characters, so the route round trip holds trivially", () => {
    for (let draw = 0; draw < 50; draw += 1) {
      const id = createBatchId();

      expect(encodeURIComponent(id)).toBe(id);
      expect(id).not.toMatch(/[/ ?#+=&%]/);
      // The `BAT_` prefix is uppercase by contract; the random token must be lowercase hex.
      expect(id.slice("BAT_".length)).not.toMatch(/[^0-9a-f]/);
    }
  });
});

describe("batch identifier independence", () => {
  it("contains neither the owner's identifier nor the creation instant", () => {
    const minted = defaultBatch(OWNER, new Date(INSTANT));

    expect(minted.id).toMatch(BATCH_ID_PATTERN);
    // The full identifier, the bare token, and every instant-derived fragment stay out.
    expect(minted.id).not.toContain(OWNER);
    expect(minted.id).not.toContain(OWNER.slice("VAL_".length));
    expect(minted.id).not.toContain(INSTANT);
    expect(minted.id).not.toContain(INSTANT.slice(0, "2026-09-30".length));
    expect(minted.id).not.toContain(INSTANT.slice("2026-09-30T".length, "2026-09-30T20:14".length));
  });

  it("draws independently: identical inputs mint different identifiers", () => {
    const first = defaultBatch(OWNER, new Date(INSTANT));
    const second = defaultBatch(OWNER, new Date(INSTANT));

    expect(first.id).toMatch(BATCH_ID_PATTERN);
    expect(second.id).toMatch(BATCH_ID_PATTERN);
    // A scheme deriving the ID from (validatorId, timestamp) would answer identically.
    expect(second.id).not.toBe(first.id);
  });

  it("draws independently of the CSPRNG stream position, not of a hidden input", () => {
    // Two real attempt IDs mint different batch IDs for the same instant, and the same
    // attempt mints different batch IDs across instants — the only input that changes
    // anything is the random stream.
    const owner = createAnonymousValidatorId() as AnonymousValidatorId;
    const first = defaultBatch(owner, new Date(INSTANT));
    const second = defaultBatch(owner, new Date("2026-10-01T00:00:00.000Z"));

    expect(first.id).not.toBe(second.id);
  });

  it("pairs the minted identifier with the single injected Date for createdAt", () => {
    const minted = defaultBatch(OWNER, new Date(INSTANT));

    expect(minted.createdAt).toBe(INSTANT);
    expect(minted.id).toMatch(BATCH_ID_PATTERN);
  });
});

describe("the retired-construction compatibility names", () => {
  it("defaultBatchId keeps its two-argument signature but mints the new shape", () => {
    const id = defaultBatchId(OWNER, new Date(INSTANT));

    expect(id).toMatch(BATCH_ID_PATTERN);
    expect(id).not.toContain(OWNER);
    expect(id).not.toContain(INSTANT);
  });
});
