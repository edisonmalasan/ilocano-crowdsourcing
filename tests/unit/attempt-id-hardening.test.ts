import { describe, expect, it, vi } from "vitest";

import {
  ANONYMOUS_VALIDATOR_ID_SHAPE,
  createAnonymousValidatorId,
  isAnonymousValidatorIdFormat,
  isMintedAnonymousValidatorIdFormat,
} from "@/lib/domain/anonymous-validator-id";
import {
  ANONYMOUS_VALIDATOR_ID_MINT_PATTERN,
  ANONYMOUS_VALIDATOR_ID_PATTERN,
  anonymousValidatorIdMintSchema,
  anonymousValidatorIdSchema,
} from "@/schemas/validator";

/**
 * The hardened attempt mint (OpenSpec `attempt-and-batch-capability-hardening` 2.1).
 *
 * New attempt IDs are `VAL_` + 32 lowercase hex (16 CSPRNG bytes, 128 bits), minted
 * server-side, CSPRNG-only, fail-closed. The legacy 8-hex shape is ACCEPTED wherever an
 * existing record requires it but is NEVER minted again.
 *
 * What this file proves:
 *
 *   - the mint produces exactly the new shape, from exactly 16 CSPRNG bytes (a recording
 *     stub names the byte count, and a deterministic stub names the exact output);
 *   - the legacy shape is accepted by the format check and the schema, but rejected by the
 *     mint-shape pin (function and schema), and never produced (100 draws, all new);
 *   - an unreachable CSPRNG throws rather than producing a predictable identifier.
 */

const LEGACY_ONLY = /^VAL_[0-9a-f]{8}$/;

function withCryptoStub(stub: unknown, run: () => void): void {
  vi.stubGlobal("crypto", stub);
  try {
    run();
  } finally {
    vi.unstubAllGlobals();
  }
}

function withDeterministicCrypto(fill: number, run: (seenLengths: number[]) => void): void {
  const seenLengths: number[] = [];
  vi.stubGlobal("crypto", {
    getRandomValues(array: Uint8Array): Uint8Array {
      seenLengths.push(array.length);
      array.fill(fill);
      return array;
    },
  });
  try {
    run(seenLengths);
  } finally {
    vi.unstubAllGlobals();
  }
}

describe("the hardened attempt mint", () => {
  it("mints VAL_ plus 32 lowercase hex characters", () => {
    const id = createAnonymousValidatorId();

    expect(id).toMatch(/^VAL_[0-9a-f]{32}$/);
    expect(id).toHaveLength(36);
  });

  it("draws exactly 16 CSPRNG bytes per mint", () => {
    withDeterministicCrypto(0x00, (seenLengths) => {
      createAnonymousValidatorId();

      expect(seenLengths).toEqual([16]);
    });
  });

  it("renders the CSPRNG bytes as hex, byte for byte", () => {
    withDeterministicCrypto(0xab, (seenLengths) => {
      expect(createAnonymousValidatorId()).toBe(`VAL_${"ab".repeat(16)}`);
      expect(seenLengths).toEqual([16]);
    });
  });

  it("never mints the legacy 8-hex shape (100 draws, all new)", () => {
    for (let draw = 0; draw < 100; draw += 1) {
      const id = createAnonymousValidatorId();

      expect(isMintedAnonymousValidatorIdFormat(id)).toBe(true);
      expect(LEGACY_ONLY.test(id)).toBe(false);
    }
  });

  it("fails closed when no CSPRNG is reachable", () => {
    withCryptoStub({}, () => {
      expect(() => createAnonymousValidatorId()).toThrow(/Web Crypto/);
    });
  });

  it("documents the shape it produces", () => {
    expect(ANONYMOUS_VALIDATOR_ID_SHAPE).toBe(
      "VAL_ + 16 random bytes as 32 lowercase hex characters",
    );
  });

  it("pins the mint pattern to the new shape exactly", () => {
    expect(ANONYMOUS_VALIDATOR_ID_MINT_PATTERN.source).toBe("^VAL_[0-9a-f]{32}$");
    expect(ANONYMOUS_VALIDATOR_ID_PATTERN.source).toBe("^VAL_([0-9a-f]{8}|[0-9a-f]{32})$");
  });
});

describe("legacy acceptance and the mint-shape pin", () => {
  const legacyValid = ["VAL_00000000", "VAL_deadbeef"];
  const newValid = [`VAL_${"0".repeat(32)}`, `VAL_${"f".repeat(32)}`, createAnonymousValidatorId()];

  it.each([...legacyValid, ...newValid])("accepts %s", (id) => {
    expect(isAnonymousValidatorIdFormat(id)).toBe(true);
    expect(anonymousValidatorIdSchema.safeParse(id).success).toBe(true);
  });

  it.each(legacyValid)("accepts legacy %s but the mint pin rejects it", (id) => {
    expect(isMintedAnonymousValidatorIdFormat(id)).toBe(false);
    expect(anonymousValidatorIdMintSchema.safeParse(id).success).toBe(false);
  });

  it.each(newValid)("the mint pin accepts new-shape %s", (id) => {
    expect(isMintedAnonymousValidatorIdFormat(id)).toBe(true);
    expect(anonymousValidatorIdMintSchema.safeParse(id).success).toBe(true);
  });

  it.each([
    ["seven hex digits", "VAL_0000abc"],
    ["nine hex digits", "VAL_0000abcde"],
    ["sixteen hex digits (between the shapes)", `VAL_${"a".repeat(16)}`],
    ["thirty-one hex digits", `VAL_${"a".repeat(31)}`],
    ["thirty-three hex digits", `VAL_${"a".repeat(33)}`],
    ["uppercase hex digits", `VAL_${"A".repeat(32)}`],
    ["non-hex letters", "VAL_zzzzzzzz"],
    ["prefix only", "VAL_"],
    ["trailing content", "VAL_deadbeef-extra"],
  ])("rejects a value with %s", (_label, id) => {
    expect(isAnonymousValidatorIdFormat(id)).toBe(false);
    expect(anonymousValidatorIdSchema.safeParse(id).success).toBe(false);
    expect(isMintedAnonymousValidatorIdFormat(id)).toBe(false);
  });
});
