/**
 * Opaque storage identifier for a persisted validation response.
 *
 * ============================================================================
 * WHY THIS EXISTS RATHER THAN A `uuid`
 * ============================================================================
 * The `research-schema` capability states that research primary keys SHALL be the domain identifiers
 * and SHALL NOT be surrogate `uuid` values, because no validator in this platform is a Supabase
 * authenticated user and nothing in the domain joins on an authentication subject. `validations.id`
 * is a primary key, so `randomUUID()` is not available to us here: it would satisfy the column's
 * `text` type and violate the requirement at the same time.
 *
 * It mirrors `@/lib/domain/anonymous-validator-id` in every respect that matters, because the two
 * identifiers answer the same question for the same reason:
 *
 *   - Uniform random bytes, hex-rendered, carrying NO timestamp, counter, machine, locale, or hash
 *     of anything the platform knows about the person. A sequential or time-ordered id would let
 *     anybody holding a research export order the study's submissions, which is information about
 *     the study the platform never intended to publish.
 *   - Long enough that a collision is not a thing that happens. The anonymous validator id's 32 bits
 *     are recorded in `docs/ROADMAP.md` as an open concern, and this identifier raises it rather
 *     than inheriting it: 8 bytes is 2^64, and a validator submits a handful of responses per
 *     session rather than millions.
 *
 * Like the anonymous id, this module must stay reachable only from server code even though the
 * random source is correct in a browser. The AUTHORITY to mint a research record's identity is a
 * server property; a client that could mint its own response id could overwrite or pre-empt a
 * stored response.
 */

/** Bytes of entropy per identifier (8 bytes = 64 bits), rendered as 2 hex characters each. */
const RANDOM_BYTE_COUNT = 8;

/** Lowercase hex, so the token is stable in logs and in case-sensitive comparisons. */
const HEX = "0123456789abcdef";

/** Exactly 16 hex characters, matching `validationResponseIdFormat`. */
const TOKEN_LENGTH = RANDOM_BYTE_COUNT * 2;

const VALIDATION_RESPONSE_ID_PATTERN = new RegExp(`^RSP_[0-9a-f]{${TOKEN_LENGTH}}$`);

/**
 * Test/diagnostic view of the identifier format. Deliberately not exported as a validating
 * predicate: a consumer that needs to VALIDATE must use `validationResponseIdSchema` from
 * `@/schemas/validation`, so there is exactly one definition of what the column accepts.
 */
export const VALIDATION_RESPONSE_ID_SHAPE = "RSP_ + 8 random bytes as 16 lowercase hex characters";

export function isValidationResponseIdFormat(value: string): boolean {
  return VALIDATION_RESPONSE_ID_PATTERN.test(value);
}

/**
 * Mints one identifier.
 *
 * `globalThis.crypto` rather than `node:crypto`, for the same reason
 * `createAnonymousValidatorId` does: the module stays platform-agnostic and importable from a test
 * without a Node-specific shim. Throws when no CSPRNG is reachable rather than falling back to
 * `Math.random()` — a predictable response id would let anyone pre-empt or overwrite a stored
 * research response, which is a worse outcome than a failed request.
 */
export function createValidationResponseId(): string {
  const cryptoApi = globalThis.crypto;

  if (typeof cryptoApi?.getRandomValues !== "function") {
    throw new Error(
      "createValidationResponseId requires Web Crypto (globalThis.crypto.getRandomValues). " +
        "A predictable identifier would let stored research responses be pre-empted or overwritten, " +
        "so there is no non-cryptographic fallback.",
    );
  }

  const bytes = new Uint8Array(RANDOM_BYTE_COUNT);
  cryptoApi.getRandomValues(bytes);

  let token = "";
  for (const byte of bytes) {
    token += HEX[byte >> 4]! + HEX[byte & 0x0f]!;
  }

  return `RSP_${token}`;
}
