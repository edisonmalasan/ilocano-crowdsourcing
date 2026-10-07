/**
 * Anonymous validator identity.
 *
 * A newly minted identifier is `VAL_` plus 32 lowercase hex characters (16 CSPRNG bytes,
 * 128 bits of entropy). It carries no timestamp, no counter, no machine, no locale,
 * no IP-derived component, and no hash of anything the platform knows about the person. It is
 * uniform random bytes rendered as hex, so it is not reversible, not enumerable, and not
 * correlatable across datasets by anyone who later obtains the value.
 *
 * Identifiers minted before the hardening change used 4 bytes (8 hex characters, 32 bits).
 * Those legacy values are still ACCEPTED wherever an existing record requires it, but they
 * are never minted again: the mint below pins to the 32-hex shape, and the legacy shape is
 * accepted only by the format check.
 *
 * This module must stay server-only in practice even though it has no `server-only` import:
 * the random source is correct in the browser, but the *authority* to mint an identity must sit
 * on the server. If a client component could call this, a validator could hand-craft its own ID
 * and the anonymity guarantee would quietly become "an ID the validator chose for itself", which
 * is not a research guarantee. The allocation and screening changes mint identities from their
 * server boundary.
 */

/** Bytes of entropy per minted identifier (128 bits), rendered as exactly 2 hex chars each. */
const RANDOM_BYTE_COUNT = 16;

/** Lowercase hex, so the token is stable in URLs, logs, and case-sensitive comparisons. */
const HEX = "0123456789abcdef";

/** Exactly 32 hex characters, matching the mint shape below. */
const TOKEN_LENGTH = 32;

/** The retired mint width (4 bytes, 32 bits). Accepted for existing records, never minted. */
const LEGACY_TOKEN_LENGTH = 8;

const ANONYMOUS_VALIDATOR_ID_PATTERN = new RegExp(
  `^VAL_([0-9a-f]{${LEGACY_TOKEN_LENGTH}}|[0-9a-f]{${TOKEN_LENGTH}})$`,
);

/** The shape the mint — and only the mint — produces. */
const ANONYMOUS_VALIDATOR_ID_MINT_PATTERN = new RegExp(`^VAL_[0-9a-f]{${TOKEN_LENGTH}}$`);

/**
 * Test/diagnostic view of the identifier format. Deliberately not exported as a validating
 * predicate: consumers that need to *validate* must use `anonymousValidatorIdSchema` from
 * `@/schemas/validator`, so there is exactly one definition of the format.
 */
export const ANONYMOUS_VALIDATOR_ID_SHAPE = "VAL_ + 16 random bytes as 32 lowercase hex characters";

/**
 * Accepts BOTH the new 32-hex shape and the legacy 8-hex shape, because existing research
 * records carry the legacy shape. Accepting is not minting: see `isMintedAnonymousValidatorIdFormat`.
 */
export function isAnonymousValidatorIdFormat(value: string): boolean {
  return ANONYMOUS_VALIDATOR_ID_PATTERN.test(value);
}

/**
 * The mint-shape pin: true only for the new 32-hex shape the mint produces. A legacy 8-hex
 * value accepted by `isAnonymousValidatorIdFormat` is false here, so a mint that regressed
 * to the old width fails loudly instead of hiding inside the widened accept pattern.
 */
export function isMintedAnonymousValidatorIdFormat(value: string): boolean {
  return ANONYMOUS_VALIDATOR_ID_MINT_PATTERN.test(value);
}

/**
 * Mints a new opaque anonymous validator identifier: `VAL_` plus 32 lowercase hex characters
 * drawn from 16 CSPRNG bytes (128 bits of entropy).
 *
 * Throws when no CSPRNG is reachable rather than falling back to `Math.random()`. A predictable
 * identifier would let anyone enumerate or impersonate a validator, which is a worse outcome than
 * a failed request.
 */
export function createAnonymousValidatorId(): string {
  const cryptoApi = globalThis.crypto;

  if (typeof cryptoApi?.getRandomValues !== "function") {
    throw new Error(
      "createAnonymousValidatorId requires Web Crypto (globalThis.crypto.getRandomValues). " +
        "A predictable identifier would let anonymous validators be enumerated, so there is " +
        "no non-cryptographic fallback.",
    );
  }

  const bytes = new Uint8Array(RANDOM_BYTE_COUNT);
  cryptoApi.getRandomValues(bytes);

  let token = "";
  for (const byte of bytes) {
    token += HEX[byte >> 4]! + HEX[byte & 0x0f]!;
  }

  return `VAL_${token}`;
}
