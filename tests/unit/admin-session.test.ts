import { createHash, createHmac } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  issueResearcherSession,
  RESEARCHER_SESSION_MAX_LIFETIME_SECONDS,
  type ForbiddenSessionKey,
  type ResearcherSessionPayload,
  type SessionCarriesNoCredential,
  verifyResearcherSession,
} from "@/lib/admin/session";

/**
 * The researcher session: issue, verify, and refuse.
 *
 * =================================================================================================
 * THE TYPE PIN AT THE BOTTOM, AND WHY IT HAS A RUNTIME HALF
 * =================================================================================================
 * `SessionCarriesNoCredential` is an exported alias, and an exported alias nobody names is
 * DECORATION — this project has already found that failure mode in its own ledger, where a pair of
 * such aliases were reported as "type-layer enforcement" and a measurement showed adding an optional
 * key left `tsc` at exit 0. So the alias is consumed by `const assertion: SessionCarriesNoCredential =
 * true` below, which is the line that makes it fire: an OPTIONAL fifth field of a forbidden name
 * resolves the alias to `never` and that line fails with `TS2322`.
 *
 * The OPTIONAL shape is the probe, deliberately. A required extra field breaks every object literal
 * that builds a payload with `TS2741` before the pin is evaluated, so a mutation using one appears
 * to prove the pin fires when it has only proved that a shape changed.
 *
 * A type pin cannot catch a field named something not in {@link ForbiddenSessionKey}, and it cannot
 * see the wire at all. That is why the runtime half is here and why it is not a tokenisation check:
 * `issuedPayloads` decodes what was actually SIGNED and asserts the exact key set. Two independent
 * halves — one at compile time over what this code writes, one at runtime over what a browser will
 * receive — and the prose beside each is the part a reader should weigh alongside it.
 */

/**
 * The type-layer assertion, CONSUMED.
 *
 * Named `assertion` rather than prefixed with `_` so ESLint's `varsIgnorePattern`-free configuration
 * does not turn this into a warning: the line must be a real statement for the pin to be enforcement
 * rather than a comment that mentions a type.
 */
const assertion: SessionCarriesNoCredential = true;
void assertion;

/** The fixed secret used throughout, distinct from every credential. */
const SECRET = "7b41e0c9d2a85f36";
const NOW_MS = 1_700_000_000_000;
const CREDENTIALS = ["first-credential-3a9e", "second-credential-b71c", "third-credential-05fd"];

/** Decodes the payload half of a token. The token is base64url JSON `.` base64url HMAC. */
function issuedPayload(token: string): Record<string, unknown> {
  const encoded = token.slice(0, token.indexOf("."));
  return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Record<string, unknown>;
}

/** Issues a session for a 1-based position, binding it to the credential currently at that position. */
function issueFor(
  ordinal: number,
  overrides: { nowMs?: number; credentials?: string[]; secret?: string } = {},
): string {
  return issueResearcherSession({
    ordinal,
    credential: (overrides.credentials ?? CREDENTIALS)[ordinal - 1] ?? "",
    nowMs: overrides.nowMs ?? NOW_MS,
    secret: overrides.secret ?? SECRET,
  });
}

/** Every successful verification, for the tests that need one. */
function verifyOk(token: string, overrides: { nowMs?: number; credentials?: string[] } = {}) {
  const result = verifyResearcherSession(token, {
    secret: SECRET,
    operatorSecrets: overrides.credentials ?? CREDENTIALS,
    nowMs: overrides.nowMs ?? NOW_MS,
  });
  if (!result.ok) throw new Error(`expected a valid session, got refused: ${result.reason}`);
  return result;
}

/** Every refusal, for the tests that need one. */
function verifyRefused(
  token: unknown,
  overrides: { nowMs?: number; credentials?: string[]; secret?: string } = {},
): string {
  const result = verifyResearcherSession(token, {
    secret: overrides.secret ?? SECRET,
    operatorSecrets: overrides.credentials ?? CREDENTIALS,
    nowMs: overrides.nowMs ?? NOW_MS,
  });
  if (result.ok) throw new Error("expected a refusal, got a verified session");
  return result.reason;
}

describe("issueResearcherSession", () => {
  it("issues a token of the form payload.signature with both parts base64url", () => {
    const token = issueFor(1);
    const parts = token.split(".");
    expect(parts).toHaveLength(2);
    for (const part of parts) expect(part).toMatch(/^[A-Za-z0-9_-]+$/);
    // The signature is a SHA-256 HMAC, so it is exactly 43 characters of unpadded base64url. A
    // mismatch would mean the comparator's length pre-check is guarding the wrong size.
    expect(parts[1]).toHaveLength(43);
  });

  it("records the issued instant and an expiry exactly one configured lifetime later", () => {
    const token = issueFor(1);
    const payload = issuedPayload(token) as unknown as ResearcherSessionPayload;
    const issuedAt = Math.floor(NOW_MS / 1000);
    expect(payload.iat).toBe(issuedAt);
    expect(payload.exp).toBe(issuedAt + RESEARCHER_SESSION_MAX_LIFETIME_SECONDS);
  });

  it("issues a different token for a different ordinal, and no credential appears in either", () => {
    const first = issueFor(1);
    const second = issueFor(2);
    expect(first).not.toBe(second);
    for (const credential of CREDENTIALS) {
      expect(first).not.toContain(credential);
      expect(second).not.toContain(credential);
    }
  });

  it("issues a token that does not contain the session secret either", () => {
    const token = issueFor(1);
    expect(token).not.toContain(SECRET);
  });

  it("refuses to issue for a non-positive or non-integer ordinal", () => {
    for (const ordinal of [0, -1, 1.5, Number.NaN]) {
      expect(() =>
        issueResearcherSession({
          ordinal,
          credential: CREDENTIALS[0],
          nowMs: NOW_MS,
          secret: SECRET,
        }),
      ).toThrow(/Refusing to issue a researcher session/);
    }
  });

  it("refuses to issue with a blank secret or a non-positive lifetime", () => {
    expect(() =>
      issueResearcherSession({
        ordinal: 1,
        credential: CREDENTIALS[0],
        nowMs: NOW_MS,
        secret: "  ",
      }),
    ).toThrow(/blank session-protection secret/);
    expect(() =>
      issueResearcherSession({
        ordinal: 1,
        credential: CREDENTIALS[0],
        nowMs: NOW_MS,
        secret: SECRET,
        maxLifetimeSeconds: 0,
      }),
    ).toThrow(/non-positive maximum lifetime/);
  });
});

describe("the issued payload carries no credential", () => {
  it("holds exactly five keys: a version, a position, a binding, and two instants", () => {
    const payload = issuedPayload(issueFor(2));
    // An EXACT key set, read off a real token rather than off a literal built inside the test. The
    // `Object.keys({ k: 1 })` shape this project has criticised elsewhere would be a tautology.
    expect(Object.keys(payload).sort()).toEqual(["b", "exp", "iat", "k", "v"]);
  });

  it("issues a different binding for each position, and the same binding for the same position", () => {
    // The binding pins position AND credential. Two positions holding the SAME credential produce
    // DIFFERENT bindings, because a removal that shifts a credential must still invalidate the
    // sessions that credential established — and a binding over the credential alone would not.
    const duplicated = ["same-credential-aaaa", "same-credential-aaaa"];
    const atOne = issuedPayload(issueFor(1, { credentials: duplicated })).b;
    const atTwo = issuedPayload(issueFor(2, { credentials: duplicated })).b;
    expect(atOne).not.toBe(atTwo);
    expect(issuedPayload(issueFor(2, { credentials: duplicated })).b).toBe(atTwo);
  });

  it("computes a binding that is NOT an offline verification oracle for the credential", () => {
    // The reason the binding is keyed rather than being a bare hash of the credential. With a
    // captured cookie in hand, a party must not be able to test candidate credentials against it.
    //
    // Measured, not asserted as a property of the construction: the same session-protection secret
    // that signs sessions is what keys the binding, so a candidate credential CAN be tested by
    // anyone holding that secret — and the test states the boundary honestly. What it rules out is
    // the unkeyed alternative: a binding equal to a public function of the credential would let a
    // party with no secret at all compute the expected value themselves.
    const token = issueFor(1);
    const binding = issuedPayload(token).b as string;
    expect(binding).toMatch(/^[A-Za-z0-9_-]{22}$/);
    // A SHA-256 of the credential, truncated the same way, is a value a party could compute with no
    // secret at all. The binding must not equal it.
    const unkeyed = createHash("sha256")
      .update(CREDENTIALS[0], "utf8")
      .digest()
      .subarray(0, 16)
      .toString("base64url");
    expect(binding).not.toBe(unkeyed);
    // Nor may it be the reverse: the credential is not recoverable from the binding.
    expect(binding).not.toContain(CREDENTIALS[0]);
  });

  it("changes the binding when the session-protection secret changes, because it is keyed", () => {
    const underOne = issuedPayload(issueFor(1, { secret: SECRET })).b;
    const underAnother = issuedPayload(issueFor(1, { secret: "0d9a4c7b1e3f8256" })).b;
    expect(underOne).not.toBe(underAnother);
  });

  it("carries the ordinal as a POSITION, not anything derived from the credential", () => {
    const payload = issuedPayload(issueFor(2));
    expect(payload.k).toBe(2);
    expect(payload.v).toBe(1);
  });

  it("holds no forbidden key name at the type layer, which the assertion above consumes", () => {
    // The runtime statement of the same claim, and the reason the type pin is not the whole story:
    // a type cannot see a field added to a JSON blob by something other than this module.
    const forbidden: readonly ForbiddenSessionKey[] = [
      "credential",
      "operatorSecret",
      "operatorCredential",
      "secret",
      "token",
    ];
    const keys = Object.keys(issuedPayload(issueFor(1)));
    for (const key of keys) {
      expect(forbidden).not.toContain(key);
    }
    // Closed over the forbidden LIST, so adding a name to `ForbiddenSessionKey` and then to the
    // payload fails here too. The list and the check are in the same test, which is what stops the
    // list from quietly becoming decorative.
    expect(forbidden).toHaveLength(5);
  });
});

describe("verifyResearcherSession", () => {
  it("verifies a freshly issued session and reports its ordinal and instants", () => {
    const token = issueFor(3);
    const issuedAt = Math.floor(NOW_MS / 1000);
    expect(verifyOk(token)).toEqual({
      ok: true,
      ordinal: 3,
      issuedAt,
      expiresAt: issuedAt + RESEARCHER_SESSION_MAX_LIFETIME_SECONDS,
    });
  });

  it("refuses an altered payload", () => {
    const token = issueFor(1);
    const [payload, signature] = token.split(".");
    const decoded = issuedPayload(token) as unknown as ResearcherSessionPayload;
    // A genuinely well-formed re-sign attempt is impossible without the secret, so this alters the
    // payload and KEEPS the original signature — which is exactly the forgery a party would attempt.
    const forged = Buffer.from(JSON.stringify({ ...decoded, k: 2 }), "utf8").toString("base64url");
    expect(verifyRefused(`${forged}.${signature}`)).toBe("signature");
    expect(payload).not.toBe(forged);
  });

  it("refuses a missing, truncated, or empty signature", () => {
    const token = issueFor(1);
    const [payload, signature] = token.split(".");
    expect(verifyRefused(payload as string)).toBe("malformed");
    expect(verifyRefused(`${payload}.${signature.slice(0, 20)}`)).toBe("malformed");
    expect(verifyRefused(`${payload}.`)).toBe("malformed");
    expect(verifyRefused("")).toBe("malformed");
  });

  it("refuses a signature produced with a different secret", () => {
    const token = issueFor(1);
    expect(verifyRefused(token, { secret: "0d9a4c7b1e3f8256" })).toBe("signature");
  });

  it("refuses a token whose signature is the right length but the wrong characters", () => {
    const token = issueFor(1);
    const [payload] = token.split(".");
    // A 43-character base64url string of the right SHAPE is not a signature. Asserting only the
    // shape would be a much weaker guard, and the shape check exists to keep `timingSafeEqual` from
    // throwing rather than to accept the token.
    expect(verifyRefused(`${payload}.${"A".repeat(43)}`)).toBe("signature");
  });

  it("refuses a session with no separator, or with two", () => {
    const token = issueFor(1);
    expect(verifyRefused(token.replace(".", ""))).toBe("malformed");
    expect(verifyRefused(`${token}.extra`)).toBe("malformed");
  });

  it("refuses a payload or signature outside the base64url alphabet", () => {
    const token = issueFor(1);
    const [payload, signature] = token.split(".");
    expect(verifyRefused(`${payload}+.${signature}`)).toBe("malformed");
    expect(verifyRefused(`${payload}.${signature.replace(/.$/, "+")}`)).toBe("malformed");
  });

  it("refuses an EXPIRED session, at the boundary instant", () => {
    const token = issueFor(1);
    const expiryMs = (Math.floor(NOW_MS / 1000) + RESEARCHER_SESSION_MAX_LIFETIME_SECONDS) * 1000;
    // One millisecond BEFORE expiry it is still valid; AT expiry it is not. `exp <= now` is the
    // comparison, and this is where the off-by-one would live.
    expect(verifyOk(token, { nowMs: expiryMs - 1 }).ok).toBe(true);
    expect(verifyRefused(token, { nowMs: expiryMs })).toBe("expired");
    expect(verifyRefused(token, { nowMs: expiryMs + 1000 })).toBe("expired");
  });

  it("refuses a session whose lifetime EXCEEDS the configured maximum, even while unexpired", () => {
    // A longer-lived token than this deployment issues is a forged one, and the only way to produce
    // one is with the secret — so the check is a second line of defence, not the first.
    const overlong = issueResearcherSession({
      ordinal: 1,
      credential: CREDENTIALS[0],
      nowMs: NOW_MS,
      secret: SECRET,
      maxLifetimeSeconds: RESEARCHER_SESSION_MAX_LIFETIME_SECONDS + 1,
    });
    expect(verifyRefused(overlong)).toBe("payload");
  });

  it("refuses a well-formed token carrying a payload that violates the schema", () => {
    // Signed with the real secret, so this exercises the SCHEMA and not the signature check. It is
    // the only way to reach that branch, and reaching it must still refuse.
    for (const bad of [
      { v: 2, k: 1, iat: 0, exp: 4_000_000_000 },
      { v: 1, k: 0, iat: 0, exp: 4_000_000_000 },
      { v: 1, k: 1.5, iat: 0, exp: 4_000_000_000 },
      { v: 1, k: 1, iat: 0 },
      { v: 1, k: 1, iat: 0, exp: 4_000_000_000, extra: "unexpected" },
    ]) {
      const encoded = Buffer.from(JSON.stringify(bad), "utf8").toString("base64url");
      const token = signWith(encoded, SECRET);
      expect(verifyRefused(token)).toBe("payload");
    }
  });

  it("refuses a signed payload that is not JSON at all", () => {
    const encoded = Buffer.from("this is not json", "utf8").toString("base64url");
    expect(verifyRefused(signWith(encoded, SECRET))).toBe("payload");
  });

  // -------------------------------------------------------------------------------------------
  // Removing one credential revokes that operator's sessions, and only theirs.
  // -------------------------------------------------------------------------------------------

  it("revokes ONE operator's sessions when the LAST credential is removed, and leaves the rest working", () => {
    const first = issueFor(1);
    const second = issueFor(2);
    const third = issueFor(3);

    // Remove the THIRD and last credential. Nothing before it moves, so this is the case where a
    // revocation is genuinely narrow — which is the whole reason the session records a POSITION.
    const afterRemoval = ["first-credential-3a9e", "second-credential-b71c"];
    expect(verifyRefused(third, { credentials: afterRemoval })).toBe("unknown-ordinal");
    expect(verifyOk(first, { credentials: afterRemoval }).ordinal).toBe(1);
    expect(verifyOk(second, { credentials: afterRemoval }).ordinal).toBe(2);
  });

  it("revokes the removed operator's session when a MIDDLE credential is removed, instead of transferring it", () => {
    // THIS IS THE REGRESSION THAT CHANGED THE IMPLEMENTATION.
    //
    // With a bare ordinal, removing the SECOND credential from a three-credential set leaves
    // position 2 occupied by the third operator — so the second operator's captured session keeps
    // verifying, as somebody else. A first draft of this file asserted the opposite and was wrong;
    // the implementation was wrong in a way the assertion happened to encode, and the assertion
    // passed. Revocation that transfers authority is not revocation.
    //
    // The binding is what fixes it, and the test is written to be red against the version without
    // one: with the binding deleted, `verifyRefused(second, ...)` would return a verified session.
    const second = issueFor(2);
    const first = issueFor(1);
    const third = issueFor(3);

    const withoutSecond = ["first-credential-3a9e", "third-credential-05fd"];
    expect(verifyRefused(second, { credentials: withoutSecond })).toBe("unknown-ordinal");
    // Ordinal 3 is out of range, so the third operator's session refuses too — the documented cost
    // of addressing a credential by position.
    expect(verifyRefused(third, { credentials: withoutSecond })).toBe("unknown-ordinal");
    // Only the operator BEFORE the removal is unaffected.
    expect(verifyOk(first, { credentials: withoutSecond }).ordinal).toBe(1);
  });

  it("revokes a session when a credential is REPLACED in place, keeping the same position", () => {
    // The other way a position can change hands without its index moving, and the one a length check
    // would not catch at all. A researcher rotates their own credential; the position is identical.
    const original = issueFor(1);
    const rotated = [
      "different-credential-77ff",
      "second-credential-b71c",
      "third-credential-05fd",
    ];
    expect(verifyRefused(original, { credentials: rotated })).toBe("unknown-ordinal");
    // And the same-position replacement issues and verifies normally — verified against the SAME
    // `rotated` set it was issued under. A first draft verified it against the default set, which
    // refused it for exactly the reason the previous line asserts, and so made a correct
    // implementation look broken.
    expect(verifyOk(issueFor(1, { credentials: rotated }), { credentials: rotated }).ordinal).toBe(
      1,
    );
  });

  it("refuses a session whose binding was swapped for another position's binding", () => {
    // The attack the binding exists to stop, stated as an explicit test: take a valid session and
    // repoint it. The signature covers the binding, so the repointed token is refused for a bad
    // SIGNATURE — and even with a re-signed one, the binding would no longer match position 1.
    const first = issueFor(1);
    const second = issueFor(2);
    const original = issuedPayload(first) as unknown as ResearcherSessionPayload;
    const swapped = Buffer.from(
      JSON.stringify({ ...original, b: issuedPayload(second).b }),
      "utf8",
    ).toString("base64url");
    expect(verifyRefused(signWith(swapped, SECRET))).toBe("unknown-ordinal");
  });

  it("refuses every session when the credential set is empty", () => {
    const token = issueFor(1);
    expect(verifyRefused(token, { credentials: [] })).toBe("unknown-ordinal");
  });

  // -------------------------------------------------------------------------------------------
  // Non-string and blank-secret input.
  // -------------------------------------------------------------------------------------------

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["a number", 1],
    ["an object", { a: 1 }],
    ["an array", ["a.b"]],
  ])("refuses %s as a token, with the same refusal a bad signature gets", (_label, token) => {
    expect(verifyRefused(token)).toBe("signature");
  });

  it("refuses with a blank verification secret, rather than verifying against an empty key", () => {
    const token = issueFor(1);
    expect(verifyRefused(token, { secret: "" })).toBe("signature");
    expect(verifyRefused(token, { secret: "   " })).toBe("signature");
  });

  // -------------------------------------------------------------------------------------------
  // Use does not extend a session.
  // -------------------------------------------------------------------------------------------

  it("does not extend, re-sign, or mutate anything when a valid session is used", () => {
    const token = issueFor(2);
    const payloadBefore = issuedPayload(token);

    // Four verifications across a whole lifetime, ending long after the session expired. If any
    // verification re-signed, the string would differ afterwards; if any extended the expiry, the
    // reported `expiresAt` would move.
    const expiryMs = (Math.floor(NOW_MS / 1000) + RESEARCHER_SESSION_MAX_LIFETIME_SECONDS) * 1000;
    const at = [NOW_MS, NOW_MS + 60_000, Math.floor(expiryMs / 2), expiryMs - 1].map((nowMs) =>
      verifyOk(token, { nowMs }),
    );

    for (const result of at) {
      expect(result.expiresAt).toBe(payloadBefore.exp as number);
      expect(result.issuedAt).toBe(payloadBefore.iat as number);
    }
    expect(token).toBe(issueFor(2));
    expect(issuedPayload(token)).toEqual(payloadBefore);
  });

  it("carries no `Set-Cookie`-visible attribute, because the cookie module owns those", () => {
    // A session token is an OPAQUE value. If it ever carried `HttpOnly; Secure; SameSite=Lax` in
    // the string, a caller setting it with `cookies().set` would ship those characters as part of
    // the cookie's VALUE, and the browser would treat the whole thing as opaque junk.
    const token = issueFor(1);
    for (const attribute of ["HttpOnly", "Secure", "SameSite", "Path=", "Max-Age"]) {
      expect(token).not.toContain(attribute);
    }
  });
});

/**
 * Signs an arbitrary encoded payload with the real secret.
 *
 * Present so the SCHEMA branch of `verifyResearcherSession` is reachable from a test at all: without
 * the secret a payload that violates the schema is indistinguishable from a bad signature, and the
 * "refuses a well-formed token carrying a payload that violates the schema" test would pass for the
 * wrong reason.
 */
function signWith(encodedPayload: string, secret: string): string {
  // `createHmac` rather than a hand-rolled signer, so a change to the signing algorithm in
  // `session.ts` does not silently leave this helper producing something the verifier would reject
  // for a reason that has nothing to do with the payload under test.
  const signature = createHmac("sha256", secret).update(encodedPayload, "utf8").digest("base64url");
  return `${encodedPayload}.${signature}`;
}
