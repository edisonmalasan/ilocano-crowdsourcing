/**
 * Anonymous validator identity.
 *
 * The identifier is an opaque token. It carries no timestamp, no counter, no machine, no locale,
 * no IP-derived component, and no hash of anything the platform knows about the person. It is
 * uniform random bytes rendered as hex, so it is not reversible, not enumerable, and not
 * correlatable across datasets by anyone who later obtains the value.
 *
 * This module must stay server-only in practice even though it has no `server-only` import:
 * the random source is correct in the browser, but the *authority* to mint an identity must sit
 * on the server. If a client component could call this, a validator could hand-craft its own ID
 * and the anonymity guarantee would quietly become "an ID the validator chose for itself", which
 * is not a research guarantee. The allocation and screening changes mint identities from their
 * server boundary.
 */

/** Bytes of entropy per identifier (32 bits), rendered as exactly 2 hex characters each. */
const RANDOM_BYTE_COUNT = 4;

/** Lowercase hex, so the token is stable in URLs, logs, and case-sensitive comparisons. */
const HEX = "0123456789abcdef";

/** Exactly eight hex characters, matching `anonymousValidatorIdSchema`. */
const TOKEN_LENGTH = 8;

const ANONYMOUS_VALIDATOR_ID_PATTERN = new RegExp(`^VAL_[0-9a-f]{${TOKEN_LENGTH}}$`);

/**
 * Test/diagnostic view of the identifier format. Deliberately not exported as a validating
 * predicate: consumers that need to *validate* must use `anonymousValidatorIdSchema` from
 * `@/schemas/validator`, so there is exactly one definition of the format.
 */
export const ANONYMOUS_VALIDATOR_ID_SHAPE = "VAL_ + 4 random bytes as 8 lowercase hex characters";

export function isAnonymousValidatorIdFormat(value: string): boolean {
  return ANONYMOUS_VALIDATOR_ID_PATTERN.test(value);
}

/**
 * Mints a new opaque anonymous validator identifier.
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
