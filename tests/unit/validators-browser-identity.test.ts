import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ANONYMOUS_IDENTITY_STORAGE_KEY,
  clearStoredValidatorId,
  readStoredValidatorId,
  writeStoredValidatorId,
} from "@/lib/validators/browser-identity";
import type { AnonymousValidatorId } from "@/schemas/validator";

/**
 * The browser-local PARTICIPATION ATTEMPT identity.
 *
 * This file used to test a `localStorage` token, and every case below is the same case against
 * `sessionStorage` — same names, same fake, same assertions. **Only the storage changed, and the
 * reason it had to is in design.md D1:** the approved methodology makes a *participation attempt*
 * the unit of interest, and a token whose lifetime is the device's cannot be scoped to an attempt.
 *
 * Two cases are NEW and are the ones that could not have existed before:
 *
 *   - one that stubs BOTH storages and asserts the module reaches only the session-scoped one. The
 *     old file could not have that test, because it was the `localStorage` module.
 *   - one that seeds a legacy long-lived value and asserts it is left UNREAD and UNDELETED
 *     (design.md D5). Deleting it would require code that touches `localStorage`, which is exactly
 *     what the requirement forbids, so the residue is specified rather than quietly cleaned up.
 *
 * Every pre-existing case is retained with its name. Nothing here was dropped: the count is the
 * previous count plus the two above.
 */

/**
 * A recording `Storage` that logs every operation, so a test can assert not just
 * what was read but WHICH KEYS were touched — the claim that this module owns
 * exactly one key is otherwise unverifiable.
 */
function createFakeStorage(options: { throwOn?: "get" | "set" | "remove" } = {}) {
  const operations: Array<{ op: "getItem" | "setItem" | "removeItem"; key: string }> = [];
  const entries = new Map<string, string>();

  const storage = {
    // `safeStorage` proves availability by reading `length` rather than by writing a
    // probe entry, so the fake must model it.
    get length() {
      return entries.size;
    },
    getItem(key: string) {
      operations.push({ op: "getItem", key });
      if (options.throwOn === "get") throw new Error("storage access denied");
      return entries.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      operations.push({ op: "setItem", key });
      if (options.throwOn === "set") throw new Error("quota exceeded");
      entries.set(key, value);
    },
    removeItem(key: string) {
      operations.push({ op: "removeItem", key });
      if (options.throwOn === "remove") throw new Error("storage access denied");
      entries.delete(key);
    },
  };

  return { storage, operations, entries };
}

function installStorage(value: unknown): ReturnType<typeof createFakeStorage> {
  const fake = createFakeStorage();
  if (value !== undefined) {
    fake.entries.set(ANONYMOUS_IDENTITY_STORAGE_KEY, value as string);
  }
  vi.stubGlobal("sessionStorage", fake.storage);
  return fake;
}
const VALID_ID = "VAL_0000abcd" as AnonymousValidatorId;

describe("browser-local anonymous identity", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips a stored identifier", () => {
    installStorage(undefined);

    writeStoredValidatorId(VALID_ID);

    expect(readStoredValidatorId()).toBe(VALID_ID);
  });

  it("reports absent when nothing has been stored", () => {
    installStorage(undefined);

    expect(readStoredValidatorId()).toBeNull();
  });

  it("returns a well-formed stored identifier", () => {
    installStorage("VAL_deadbeef");

    expect(readStoredValidatorId()).toBe("VAL_deadbeef");
  });

  it("discards a malformed stored value instead of returning it", () => {
    const fake = installStorage("not-a-validator-id");

    expect(readStoredValidatorId()).toBeNull();
    // The bad value is removed, so it is not re-read and re-rejected on every visit.
    expect(fake.entries.has(ANONYMOUS_IDENTITY_STORAGE_KEY)).toBe(false);
  });

  it.each([
    ["empty string", ""],
    ["wrong prefix", "val_0000abcd"],
    ["uppercase hex", "VAL_0000ABCD"],
    ["too short", "VAL_0000abc"],
    ["too long", "VAL_0000abcde"],
    ["non-hex characters", "VAL_zzzzzzzz"],
    ["trailing whitespace", " VAL_0000abcd"],
    ["no separator", "VAL0000abcd"],
    ["embedded null", "VAL_0000abcd\u0000"],
  ])("rejects a stored value that is %s", (_label, stored) => {
    installStorage(stored);

    expect(readStoredValidatorId()).toBeNull();
  });

  it("clears the stored identifier on request", () => {
    installStorage(undefined);
    writeStoredValidatorId(VALID_ID);

    clearStoredValidatorId();

    expect(readStoredValidatorId()).toBeNull();
  });

  it("touches no key other than its own", () => {
    const fake = installStorage(undefined);

    writeStoredValidatorId(VALID_ID);
    readStoredValidatorId();
    clearStoredValidatorId();

    const touched = new Set(fake.operations.map((operation) => operation.key));
    expect([...touched]).toEqual([ANONYMOUS_IDENTITY_STORAGE_KEY]);
  });

  it("stores no screening answer, batch, or research response", () => {
    const fake = installStorage(undefined);

    writeStoredValidatorId(VALID_ID);

    // Every value the module ever writes is the identifier and nothing else.
    const written = fake.operations
      .filter((operation) => operation.op === "setItem")
      .map((operation) => fake.entries.get(operation.key));
    for (const value of written) {
      expect(value).toMatch(/^VAL_[0-9a-f]{8}$/);
    }
  });

  it("reports absent when sessionStorage is entirely unavailable", () => {
    vi.stubGlobal("sessionStorage", undefined);

    expect(readStoredValidatorId()).toBeNull();
    expect(() => writeStoredValidatorId(VALID_ID)).not.toThrow();
    expect(() => clearStoredValidatorId()).not.toThrow();
  });

  it("reports absent when accessing storage throws", () => {
    const throwing = createFakeStorage({ throwOn: "get" });
    vi.stubGlobal("sessionStorage", throwing.storage);

    expect(readStoredValidatorId()).toBeNull();
  });

  // ---------------------------------------------------------------------------------
  // `safeStorage` has three ways to conclude storage is unusable, and the two
  // non-obvious ones had no coverage. A test that throws from `getItem` only exercises
  // the first: it gets past the availability check and fails on the read.
  //
  // The other two are the ones that actually fire in the wild. Safari in private mode,
  // and any browser with third-party storage blocked, make ACCESSING `sessionStorage`
  // throw a SecurityError on the property access itself - which is a getter, so it
  // throws before `length` is ever reached.
  // ---------------------------------------------------------------------------------
  it("reports absent when ACCESSING sessionStorage throws, before any method is called", () => {
    // A throwing getter, exactly as a browser implements private-mode storage: the
    // property access itself raises a SecurityError, before any method is reached.
    const globalWithThrowingStorage = Object.create(globalThis) as typeof globalThis;
    Object.defineProperty(globalWithThrowingStorage, "sessionStorage", {
      configurable: true,
      get() {
        throw new DOMException("The operation is insecure.", "SecurityError");
      },
    });
    vi.stubGlobal("globalThis", globalWithThrowingStorage);

    // Every operation degrades to "no stored identity" rather than propagating, which is
    // the property that matters: a participant in private mode must still be able to
    // use the platform.
    expect(readStoredValidatorId()).toBeNull();
    expect(() => writeStoredValidatorId(VALID_ID)).not.toThrow();
    expect(() => clearStoredValidatorId()).not.toThrow();
    expect(readStoredValidatorId()).toBeNull();
  });

  it("reports absent when the storage object has no numeric length", () => {
    // Some embedded and instrumented webviews expose a `sessionStorage` object whose
    // `length` is not a number. `typeof` rather than a truthiness check, so a `length` of
    // 0 - a genuinely empty store - is still treated as usable.
    //
    // ROUND FIVE: this test asserted only that `readStoredValidatorId()` is null, against
    // an EMPTY fake storage. An empty store returns null whether or not the
    // `typeof candidate.length !== "number"` guard exists, so deleting that guard left
    // the test green. It was enforcing nothing at all while `tasks.md` recorded this row
    // as red-confirmed against "a non-numeric `length`". That is the "compares a function
    // to itself" mistake rounds two and three also found, in its purest form: a passing
    // test with no claim behind it.
    //
    // The fix is to make the guard the ONLY possible reason for a null. Store a real
    // identifier first, so the storage genuinely holds one and the non-numeric length is
    // the single thing preventing it being read. Now deleting the guard returns the
    // identifier and this test goes red.
    const { storage } = createFakeStorage();
    vi.stubGlobal("sessionStorage", storage);
    writeStoredValidatorId(VALID_ID);
    expect(readStoredValidatorId()).toBe(VALID_ID); // the control: storage works

    Object.defineProperty(storage, "length", { get: () => "0" });

    // Null now, and only because the length is not a number.
    expect(readStoredValidatorId()).toBeNull();

    // And the same is true on the way out: a write is refused rather than throwing.
    expect(() => writeStoredValidatorId("VAL_deadbeef")).not.toThrow();
  });

  it("treats a storage with length 0 as usable, not as unavailable", () => {
    // The boundary case for the `typeof length !== "number"` check: 0 is falsy, so a
    // truthiness check here would reject an ordinary empty store and silently disable
    // resume for a first-time visitor.
    const { storage } = createFakeStorage();
    Object.defineProperty(storage, "length", { get: () => 0 });
    vi.stubGlobal("sessionStorage", storage);

    expect(readStoredValidatorId()).toBeNull(); // nothing stored, but storage WORKED
    expect(() => writeStoredValidatorId(VALID_ID)).not.toThrow();
    expect(readStoredValidatorId()).toBe(VALID_ID);
  });

  it("does not fail enrollment when writing storage throws", () => {
    const throwing = createFakeStorage({ throwOn: "set" });
    vi.stubGlobal("sessionStorage", throwing.storage);

    // The caller has already enrolled successfully at this point; losing the
    // resume convenience must not surface as a failure.
    expect(() => writeStoredValidatorId(VALID_ID)).not.toThrow();
  });

  it("does not fail when removing storage throws", () => {
    const throwing = createFakeStorage({ throwOn: "remove" });
    vi.stubGlobal("sessionStorage", throwing.storage);

    expect(() => clearStoredValidatorId()).not.toThrow();
  });

  it("does not mistake a storage failure for a malformed value", () => {
    // A throwing read must not trigger a clear(): the value may be perfectly good
    // and the participant may still be able to resume on a future visit.
    const throwing = createFakeStorage({ throwOn: "get" });
    vi.stubGlobal("sessionStorage", throwing.storage);

    readStoredValidatorId();

    expect(throwing.operations.some((operation) => operation.op === "removeItem")).toBe(false);
  });

  // ---------------------------------------------------------------------------------
  // The two cases this change adds. Neither could exist while the module wrote to
  // `localStorage`, because in that world `localStorage` WAS the storage it was supposed to use.
  // ---------------------------------------------------------------------------------
  it("reaches only session-scoped storage, and never storage that outlives the session", () => {
    // BOTH are stubbed, and the assertion is on the long-lived one's OPERATION LOG rather than on
    // the return value. An assertion on the return value alone is satisfied by a module that read
    // `localStorage` and happened to find nothing there.
    const session = createFakeStorage();
    const longLived = createFakeStorage();
    vi.stubGlobal("sessionStorage", session.storage);
    vi.stubGlobal("localStorage", longLived.storage);

    writeStoredValidatorId(VALID_ID);
    expect(readStoredValidatorId()).toBe(VALID_ID);
    clearStoredValidatorId();

    expect(session.operations.length).toBeGreaterThan(0);
    expect(longLived.operations).toEqual([]);
  });

  it("leaves a legacy long-lived value UNREAD and UNDELETED", () => {
    // Design.md D5. The residue is specified rather than cleaned up: deleting it needs code that
    // touches `localStorage`, which is what the requirement forbids, and it would turn every page
    // load into a write. Asserting UNREAD is what stops the residue from quietly becoming live.
    const session = createFakeStorage();
    const longLived = createFakeStorage();
    // A value that is a perfectly VALID identifier, so a module that reached for it would find one
    // and this test could not tell "did not look" from "looked and found nothing".
    longLived.entries.set(ANONYMOUS_IDENTITY_STORAGE_KEY, VALID_ID);
    vi.stubGlobal("sessionStorage", session.storage);
    vi.stubGlobal("localStorage", longLived.storage);

    expect(readStoredValidatorId()).toBeNull();
    expect(longLived.operations).toEqual([]);
    expect(longLived.entries.get(ANONYMOUS_IDENTITY_STORAGE_KEY)).toBe(VALID_ID);
  });
});
