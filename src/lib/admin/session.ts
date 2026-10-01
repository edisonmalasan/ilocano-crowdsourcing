import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/**
 * The researcher session: an opaque, integrity-protected bearer value.
 *
 * ============================================================================
 * WHY THE SESSION IS SELF-CONTAINED
 * ============================================================================
 * A session is verified from its own contents plus one server-side secret. There is no server-side
 * session table, so sign-out cannot invalidate a session that was already captured — that residual
 * window is real and the spec requires it to be STATED rather than implied away, which is what
 * {@link RESEARCHER_SESSION_MAX_LIFETIME_SECONDS} bounds and what the sign-out copy says.
 *
 * The alternative — a server-side session row — would make sign-out authoritative, and it is
 * rejected for a reason specific to this project: it needs a durable store keyed by a credential
 * that identifies nobody, on a schema whose deny-all posture is a research guarantee rather than an
 * implementation detail. The bounded window is the honest trade, and it is stated rather than
 * hidden.
 *
 * ============================================================================
 * WHY THE PAYLOAD CARRIES AN ORDINAL *AND* A KEYED BINDING
 * ============================================================================
 * The cookie is httpOnly, but it is still handed to the browser, and a browser is not a trusted
 * place to keep a secret. So the payload never carries the credential, and never carries anything
 * DERIVED FROM IT BY A PUBLIC FUNCTION. It carries two things instead:
 *
 *   `k` — the establishing credential's 1-based POSITION in configuration (D3).
 *   `b` — a BINDING: `HMAC(sessionSecret, "v1" ‖ position ‖ credential)`, truncated to 16 bytes.
 *
 * A bare ordinal is not enough, and the reason is worth stating because it was a defect before it
 * was a decision. Positions shift: remove the SECOND credential from a three-credential set and
 * position 2 now holds what used to be position 3 — so the first operator's captured session
 * continues to verify, as a DIFFERENT operator. Revocation would silently transfer authority rather
 * than remove it, which is the opposite of what D3 set out to achieve.
 *
 * The binding closes that, and it is safe to put in a browser for two independent reasons:
 *
 *   - It is KEYED by the session-protection secret, which the browser does not hold. A party with a
 *     captured cookie cannot test a candidate credential against it, so the cookie is not an
 *     offline verification oracle the way an unkeyed SHA-256 of the credential would be.
 *   - It is NOT reversible without that same secret, so the credential is not recoverable from the
 *     session — which is the spec's own scenario, and the one this file exists to satisfy.
 *
 * A party who holds the session secret is an operator holding a session, so the binding discloses
 * nothing to them that they did not already have.
 *
 * The cost, unchanged and deliberate: REORDERING the set invalidates outstanding sessions, because
 * both the position and the credential at that position are part of the binding. `.env.example` says
 * so where an operator will see it.
 *
 * ============================================================================
 * WHY COMPARISON IS NOT AN EQUALITY TEST
 * ============================================================================
 * The signature is compared with `timingSafeEqual` over fixed-length digests, for the same reason
 * `credentials.ts` does it and not with `===`.
 */

/**
 * A SHA-256 signature in unpadded base64url is always exactly 43 characters.
 *
 * The signature is 32 bytes, and no `SIGNATURE_BYTES` constant exists alongside this one because it
 * would have no reader: the character length is what the tokenizer compares, and the byte length is
 * fixed by `createHash("sha256")` rather than by anything this file chooses. A named constant for a
 * number nothing reads is documentation pretending to be code, and ESLint was right to flag the
 * first draft of it.
 */
const SIGNATURE_CHARS = 43;

/** 16 bytes in unpadded base64url is always exactly 22 characters. */
const BINDING_BASE64URL_CHARS = 22;

/**
 * Domain separator for the binding.
 *
 * Binds the MAC to THIS project's purpose and to the format version, so a value computed for some
 * other use with the same secret and the same credential cannot be pasted in as a binding. A
 * separator that could itself appear inside a credential would allow a crafted credential to
 * impersonate a different position, and `0x1f` (unit separator) is chosen because it is the ASCII
 * character least likely to be typed and is not valid in a base64url environment variable value by
 * convention.
 */
const BINDING_DOMAIN = "v1\x1f";

/** base64url alphabet, no padding. */
const BASE64URL = /^[A-Za-z0-9_-]+$/;

/**
 * The maximum lifetime of a session, in seconds.
 *
 * This is the configured bound the spec requires: a session's expiry is `issuedAt` plus this value,
 * and nothing extends it. Repeated requests inside the window leave `exp` untouched, because
 * {@link verifyResearcherSession} returns a value and never rewrites the token — there is no code
 * path here that re-signs.
 *
 * Eight hours covers a working day for one researcher on one machine and bounds what a captured
 * cookie is worth after a sign-out to a single working day. It is a module constant rather than a
 * database row because it is a property of the deployment, not of any research record, and no
 * scenario depends on the specific number.
 */
export const RESEARCHER_SESSION_MAX_LIFETIME_SECONDS = 8 * 60 * 60;

/** Bytes of the binding kept. 16 bytes is 128 bits, far beyond guessing, and keeps the cookie small. */
const BINDING_BYTES = 16;

/**
 * The issued payload, as a closed type.
 *
 * It is deliberately tiny: a version, the establishing credential's 1-based position, a binding that
 * pins that position to that credential, and two epoch seconds. Anything else would be either
 * redundant (the browser must not know more) or a leak.
 */
export interface ResearcherSessionPayload {
  /** Format version. A future format change bumps it, and old tokens then refuse rather than misread. */
  readonly v: 1;
  /** 1-based position in `ADMIN_OPERATOR_SECRETS` of the credential that established this session. */
  readonly k: number;
  /**
   * The binding: a keyed MAC over the format version, the position, and the credential itself.
   *
   * Not a credential and not recoverable as one. It is named `b` because the cookie is read by
   * nobody and the point is only that the value at this position is the one that signed this session.
   */
  readonly b: string;
  /** Issued at, epoch seconds, from the server's clock. */
  readonly iat: number;
  /** Expires at, epoch seconds. `iat` plus the configured maximum lifetime. */
  readonly exp: number;
}

/**
 * Field names that would mean a credential had leaked into the session.
 *
 * This list is what {@link SessionCarriesNoCredential} is measured against, and it exists because a
 * "the payload has no credential" assertion written as a comment is not an assertion: adding a field
 * named `operatorSecret` would leave the comment true and the code wrong.
 */
export type ForbiddenSessionKey =
  "credential" | "operatorSecret" | "operatorCredential" | "secret" | "token";

/**
 * `true` when the payload carries no credential field; `never` when one of
 * {@link ForbiddenSessionKey} appears.
 *
 * `tests/unit/admin-session.test.ts` names this at an assertion site, which is what makes it
 * enforcement rather than decoration: adding `operatorSecret?: string` to
 * {@link ResearcherSessionPayload} makes `SessionCarriesNoCredential` resolve to `never` and
 * `typecheck` fails with `TS2322: Type 'true' is not assignable to type 'never'`.
 *
 * The OPTIONAL field is the probe, deliberately. A required extra field breaks every object literal
 * in the file with `TS2741` before the pin is ever evaluated, so a mutation using one appears to
 * prove the pin fires when it has only proved that the shape changed. Both arms were measured:
 * `operatorSecret?: string` gives `TS2322: Type 'true' is not assignable to type 'never'`, and a
 * required `extraProbe: string` gives `TS2741` with no mention of this type at all.
 *
 * =================================================================================================
 * WHAT THIS PIN DOES NOT DO, MEASURED RATHER THAN ASSUMED
 * =================================================================================================
 * It is NAME-BASED, so it does not close the key set. Adding an optional `extraProbe?: string` — a key
 * that is not a credential name — leaves `typecheck` at exit 0 with this pin in place. Measured, and
 * it is a property of the construction rather than a defect: a list of forbidden names cannot reject
 * a name it does not contain.
 *
 * What closes the set is the other two halves, and both are asserted elsewhere:
 * `tests/unit/admin-session.test.ts` reads an EXACT five-key set off a real issued payload rather
 * than off a literal built in the test, and the decode schema is a `strictObject`, so a signed token
 * carrying a sixth key is refused at verification. Read this pin as "no credential-named field", not
 * as "no field beyond the five".
 */
export type SessionCarriesNoCredential =
  Extract<keyof ResearcherSessionPayload, ForbiddenSessionKey> extends never ? true : never;

/**
 * The runtime authority on the payload's shape.
 *
 * `strictObject`, so a token carrying any unexpected key is REFUSED rather than accepted with the
 * extras ignored. That is the runtime half to weigh alongside the type half above: the type says what
 * this code writes, the schema says what this code is willing to believe.
 */
const researcherSessionPayloadSchema = z.strictObject({
  v: z.literal(1),
  k: z.number().int().positive(),
  // 16 bytes in unpadded base64url is exactly 22 characters. The length is checked so that a
  // malformed binding is refused by the SCHEMA rather than reaching the constant-time comparison,
  // where a length mismatch would make `timingSafeEqual` throw.
  b: z.string().length(BINDING_BASE64URL_CHARS),
  iat: z.number().int().nonnegative(),
  exp: z.number().int().positive(),
});

export type ResearcherSessionVerification =
  | {
      readonly ok: true;
      /** 1-based position of the credential that established the session. Not a secret. */
      readonly ordinal: number;
      readonly issuedAt: number;
      readonly expiresAt: number;
    }
  | { readonly ok: false; readonly reason: ResearcherSessionRefusal };

/**
 * Why a session did not verify.
 *
 * These are for LOGS and tests, never for the response. Every one of them produces the same refusal
 * a request carrying no session at all receives, because a reason a caller can act on is a reason an
 * attacker can probe with. `tests/unit/admin-guard.test.ts` asserts the refusal a caller sees is
 * byte-identical across all of them.
 *
 * `unknown-ordinal` covers two distinct situations on purpose — the position no longer exists, and
 * the position exists but holds a different credential — because a log that distinguished them would
 * be telling an operator which of two changes someone made to the environment. It is still enough
 * to act on: "your session refers to a credential that is no longer at that position."
 */
export type ResearcherSessionRefusal =
  "malformed" | "signature" | "payload" | "expired" | "unknown-ordinal";

export interface IssueResearcherSessionArgs {
  /** 1-based position of the credential establishing this session. */
  readonly ordinal: number;
  /**
   * The credential at that position, used ONLY to derive the binding.
   *
   * It is not stored, not encoded, and not recoverable from the token. It has to be passed in
   * because the binding is a MAC over the credential, and a caller that passed a pre-computed
   * binding instead could bind a session to anything at all.
   */
  readonly credential: string;
  /** The server's clock, epoch milliseconds. Passed in so the lifetime is testable. */
  readonly nowMs: number;
  /** Protects session integrity, and keys the binding. Never one of the operator credentials. */
  readonly secret: string;
  /** Overrides the configured maximum lifetime. Exposed for tests; production omits it. */
  readonly maxLifetimeSeconds?: number;
}

/**
 * Issues a signed, opaque session token.
 *
 * Refuses to issue anything when the inputs cannot produce a well-formed token: a non-integer or
 * non-positive ordinal, a blank credential, a blank secret, or a non-positive lifetime. A "sign and
 * hope" issuer is how a session with `k: 0` gets minted, and `k: 0` resolves to no credential at
 * all — a session that verifies against nobody.
 */
export function issueResearcherSession(args: IssueResearcherSessionArgs): string {
  const lifetime = args.maxLifetimeSeconds ?? RESEARCHER_SESSION_MAX_LIFETIME_SECONDS;

  if (!Number.isInteger(args.ordinal) || args.ordinal < 1) {
    throw new Error(
      "Refusing to issue a researcher session: `ordinal` is the 1-based position of the " +
        "establishing credential, so it must be a positive integer. A non-positive value would " +
        "produce a session that resolves to no configured credential.",
    );
  }
  if (args.credential === "") {
    throw new Error(
      "Refusing to issue a researcher session bound to an EMPTY credential. The binding is what " +
        "pins this session to one operator, and an empty one would bind it to nothing while " +
        "still verifying against whatever ends up in that position.",
    );
  }
  if (args.secret.trim() === "") {
    throw new Error(
      "Refusing to issue a researcher session with a blank session-protection secret. An " +
        "unprotected session is forgeable by anyone who can read this file's source.",
    );
  }
  if (!Number.isInteger(lifetime) || lifetime < 1) {
    throw new Error(
      "Refusing to issue a researcher session with a non-positive maximum lifetime. The spec " +
        "requires every session to be time-bounded.",
    );
  }

  const issuedAt = Math.floor(args.nowMs / 1000);
  const payload: ResearcherSessionPayload = {
    v: 1,
    k: args.ordinal,
    b: computeBinding(args.ordinal, args.credential, args.secret),
    iat: issuedAt,
    exp: issuedAt + lifetime,
  };

  const encoded = encodePayload(payload);
  return `${encoded}.${sign(encoded, args.secret)}`;
}

/**
 * The binding for one position and credential, as unpadded base64url.
 *
 * Truncated from the full 32-byte HMAC to 16. A truncation of a MAC is safe — an attacker cannot
 * recover the discarded half without producing a second MAC for the same message, which would take
 * a second preimage — and it keeps the cookie within what every browser accepts without splitting
 * a `Set-Cookie` header.
 */
function computeBinding(ordinal: number, credential: string, secret: string): string {
  const mac = createHmac("sha256", secret)
    .update(`${BINDING_DOMAIN}${ordinal}\x1f${credential}`, "utf8")
    .digest();
  return mac.subarray(0, BINDING_BYTES).toString("base64url");
}

/**
 * Verifies a presented session.
 *
 * Order matters and is the argument for this function existing at all: the SIGNATURE is checked
 * before the payload is trusted, so a tampered payload is refused as a bad signature rather than
 * being parsed first and refused later. `operatorSecrets` is consulted only after the signature
 * passes, and only to answer whether the recorded ordinal still resolves.
 *
 * This function NEVER extends, re-signs, or mutates anything. There is no path here that produces a
 * replacement token, which is what makes "use does not silently extend a session" a property of the
 * code rather than a promise about it.
 */
export function verifyResearcherSession(
  token: unknown,
  args: {
    readonly secret: string;
    readonly operatorSecrets: readonly string[];
    readonly nowMs: number;
  },
): ResearcherSessionVerification {
  if (typeof token !== "string" || args.secret.trim() === "") return refuse("signature");

  const separator = token.indexOf(".");
  if (separator <= 0 || token.indexOf(".", separator + 1) !== -1) return refuse("malformed");

  const encoded = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  if (
    !BASE64URL.test(encoded) ||
    signature.length !== SIGNATURE_CHARS ||
    !BASE64URL.test(signature)
  ) {
    return refuse("malformed");
  }

  // Constant-time over equal-length digests. A length check already ran above, so the two operands
  // are always 32 bytes and `timingSafeEqual` cannot throw.
  const expected = Buffer.from(sign(encoded, args.secret), "base64url");
  const presented = Buffer.from(signature, "base64url");
  if (!timingSafeEqual(expected, presented)) return refuse("signature");

  const parsed = researcherSessionPayloadSchema.safeParse(decodePayload(encoded));
  if (!parsed.success) return refuse("payload");

  const payload = parsed.data;
  // Expiry is checked against the server's clock, and a session whose lifetime exceeds the
  // configured maximum is refused even if it is unexpired — a longer-lived token than this
  // deployment issues is a forged one.
  const nowSeconds = Math.floor(args.nowMs / 1000);
  if (payload.exp <= nowSeconds) return refuse("expired");
  if (payload.exp - payload.iat > RESEARCHER_SESSION_MAX_LIFETIME_SECONDS) return refuse("payload");
  if (payload.k > args.operatorSecrets.length) return refuse("unknown-ordinal");

  // The binding check, and the reason a bare ordinal is not enough. A position that still RESOLVES
  // is not the same as the position that SIGNED: removing an earlier credential shifts everything
  // after it, so without this the first operator's captured session would keep working as whichever
  // operator now holds that position. Compared in constant time, because a binding is a MAC and a
  // `!==` on it would reintroduce exactly the timing leak this project has refused three times.
  // Named `expectedBinding`, not `expected`: the signature comparison above already holds an
  // `expected` in this scope, and reusing the name would have made the two MACs interchangeable by
  // reading — which is exactly the kind of confusion that produces a guard comparing a value against
  // itself.
  const expectedBinding = computeBinding(
    payload.k,
    args.operatorSecrets[payload.k - 1] ?? "",
    args.secret,
  );
  if (
    !timingSafeEqual(Buffer.from(payload.b, "base64url"), Buffer.from(expectedBinding, "base64url"))
  ) {
    return refuse("unknown-ordinal");
  }

  return { ok: true, ordinal: payload.k, issuedAt: payload.iat, expiresAt: payload.exp };
}

/** Encodes a payload as unpadded base64url JSON. */
function encodePayload(payload: ResearcherSessionPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

/**
 * Decodes a payload, or returns `null` rather than throwing.
 *
 * `Buffer.from(x, "base64url")` is lenient about characters outside the alphabet, so the alphabet is
 * checked by the caller before this runs. What remains is a byte string that may still not be JSON,
 * and a throw here would escape as an exception rather than as a refusal.
 */
function decodePayload(encoded: string): unknown {
  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

/** The unpadded base64url HMAC-SHA-256 of the encoded payload. */
function sign(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(encodedPayload, "utf8").digest("base64url");
}

/** One refusal shape for every cause, so a caller cannot accidentally branch on the reason. */
function refuse(reason: ResearcherSessionRefusal): ResearcherSessionVerification {
  return { ok: false, reason };
}
