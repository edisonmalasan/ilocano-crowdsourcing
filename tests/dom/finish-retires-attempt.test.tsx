import { beforeEach, describe, expect, it, vi } from "vitest";

import { FinishedBatch, FINISH_HREF } from "@/app/validate/[batchId]/finished-batch";
import { translatorFor } from "@/lib/i18n/copy";
import {
  ANONYMOUS_IDENTITY_STORAGE_KEY,
  clearStoredValidatorId,
  readStoredValidatorId,
  writeStoredValidatorId,
} from "@/lib/validators/browser-identity";
import type { AnonymousValidatorId } from "@/schemas/validator";

import { mount, type Mounted } from "./support/dom-harness";

/**
 * The attempt token REALLY being discarded, against a REAL `Storage`.
 *
 * =================================================================================================
 * WHY THIS IS A SECOND FILE AND NOT PART OF `finished-batch.test.tsx`
 * =================================================================================================
 * `vi.mock` is file-wide, and the finished screen's existing DOM file needs the identity module
 * STUBBED for two reasons that a real storage cannot serve: three of its tests set the stored identity
 * (one of them to `null`), and CB-1's "the identity is read at PRESS time" claim is made observable by
 * COUNTING the reads, which a real `Storage` does not offer. So the stub stays there and the real
 * thing is driven here.
 *
 * The measurement that made this file possible at all:
 *
 *   - `happy-dom` in this project exposes NO `localStorage`. Measured, not assumed: the first draft of
 *     the finished screen's DOM file called `window.localStorage.setItem(...)` in `beforeEach` and
 *     every test failed with `TypeError: Cannot read properties of undefined (reading 'clear')`.
 *   - `happy-dom` DOES expose `sessionStorage`, and it works. An earlier note in this project claimed
 *     it exposed "neither `localStorage` nor `sessionStorage`"; that was half false, and it became
 *     half false the moment the identity module moved to `sessionStorage`. `finished-batch.test.tsx`
 *     now asserts the enumeration itself, so the claim cannot rot again.
 *
 * =================================================================================================
 * WHAT THIS DOES AND DOES NOT PROVE
 * =================================================================================================
 * It DOES prove that pressing FINISH removes the key from a working `Storage`, through the real
 * `clearStoredValidatorId`, and that CONTINUING does not — which is a strictly stronger claim than
 * "the component asked the module to discard it", and the only assertion anywhere that would notice if
 * `clearStoredValidatorId` were changed to write something else instead of removing.
 *
 * It does NOT prove anything about a real browser. `happy-dom`'s `Storage` is an in-memory map that
 * lives as long as the document, so it shares none of the properties the change actually turns on:
 * that it is scoped to a TAB, that it survives a reload, and that it disappears when the tab closes.
 * **No browser has been opened, no second tab has been observed, and no reload has been performed.**
 * Those are the three load-bearing claims of `design.md` D1 and none of them is observable here.
 */

const h = vi.hoisted(() => ({
  pushes: [] as string[],
  /** Every payload handed to the allocation Server Action, in order. */
  requests: [] as unknown[],
  result: { status: "exhausted" } as unknown,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: (destination: string) => {
      h.pushes.push(destination);
    },
    replace: () => {},
    refresh: () => {},
    back: () => {},
  }),
}));

vi.mock("@/lib/allocation/actions", () => ({
  requestBatchAction: vi.fn(async (raw: unknown) => {
    h.requests.push(raw);
    return h.result;
  }),
}));

const t = translatorFor("en");

/** A well-formed identifier, because the real module validates what it reads. */
const ATTEMPT_ID = "VAL_a81d92c1" as AnonymousValidatorId;

const KEY = ANONYMOUS_IDENTITY_STORAGE_KEY;

/** Every key currently in the real storage, in the storage's own order. */
function storageKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < globalThis.sessionStorage.length; i += 1) {
    const key = globalThis.sessionStorage.key(i);
    if (key !== null) keys.push(key);
  }
  return keys;
}

let view: Mounted;

function finishControl(): HTMLButtonElement {
  const label = t("validate.finished.finish");
  const matches = (view.all("button") as HTMLButtonElement[]).filter(
    (node) => (node.textContent ?? "").trim() === label,
  );
  expect(matches, `expected exactly one control labelled ${JSON.stringify(label)}`).toHaveLength(1);
  return matches[0];
}

function continueControl(): HTMLButtonElement {
  const label = t("validate.finished.continue");
  const matches = (view.all("button") as HTMLButtonElement[]).filter(
    (node) => (node.textContent ?? "").trim() === label,
  );
  expect(matches, `expected exactly one control labelled ${JSON.stringify(label)}`).toHaveLength(1);
  return matches[0];
}

beforeEach(() => {
  h.pushes.length = 0;
  h.requests.length = 0;
  h.result = { status: "exhausted" };
  globalThis.sessionStorage.clear();
  view = mount(<FinishedBatch locale="en" />);
});

describe("the storage this file claims to be real, is real", () => {
  it("reads and writes through the module into a working Storage", () => {
    // The control for every assertion below, and it is the reason this file exists rather than a
    // comment in the other one. If `sessionStorage` were absent, or were an object that silently
    // dropped writes, then "the key was removed" would be satisfied by a module that removed nothing.
    expect(globalThis.sessionStorage).toBeDefined();
    expect(globalThis.localStorage).toBeUndefined();

    writeStoredValidatorId(ATTEMPT_ID);
    expect(globalThis.sessionStorage.getItem(KEY)).toBe(ATTEMPT_ID);
    expect(readStoredValidatorId()).toBe(ATTEMPT_ID);

    clearStoredValidatorId();
    expect(globalThis.sessionStorage.getItem(KEY)).toBeNull();
    expect(readStoredValidatorId()).toBeNull();

    // And the module owns exactly the one key it says it owns — the guard `browser-identity` itself
    // makes, re-observed here against real storage rather than against a fake. Enumerated rather than
    // spot-checked, because "it wrote the right key" is also true of a module that wrote three keys.
    writeStoredValidatorId(ATTEMPT_ID);
    globalThis.sessionStorage.setItem("unrelated.key", "kept");
    expect(storageKeys()).toEqual([KEY, "unrelated.key"]);
  });
});

describe("FINISH retires the attempt in this browser session", () => {
  it("removes the attempt key, and asks to be navigated to the landing page", async () => {
    // Seeded the way the platform seeds it — through the module, so the value is one the module would
    // accept — and asserted PRESENT before the press. Without that first assertion, "the key is absent
    // afterwards" would also be satisfied by a component that never had a token to remove.
    writeStoredValidatorId(ATTEMPT_ID);
    globalThis.sessionStorage.setItem("unrelated.key", "kept");
    expect(globalThis.sessionStorage.getItem(KEY)).toBe(ATTEMPT_ID);

    await view.pressAndSettle(finishControl());

    // THE CLAIM. An actual removal, observed in a working `Storage`, through the real module.
    expect(globalThis.sessionStorage.getItem(KEY)).toBeNull();
    expect(readStoredValidatorId(), "the browser no longer holds this attempt").toBeNull();
    // Still writes nothing to the server, and still leaves the flow.
    expect(h.requests).toEqual([]);
    expect(h.pushes).toEqual([FINISH_HREF]);
    // And it removed ITS OWN key only. A `clear()` instead of a `removeItem()` would satisfy the
    // assertion above and destroy storage it does not own — which is why the unrelated key is here.
    expect(globalThis.sessionStorage.getItem("unrelated.key")).toBe("kept");
  });

  it("leaves an unrelated key alone", async () => {
    globalThis.sessionStorage.setItem("unrelated.key", "kept");
    writeStoredValidatorId(ATTEMPT_ID);

    await view.pressAndSettle(finishControl());

    expect(globalThis.sessionStorage.getItem(KEY)).toBeNull();
    expect(globalThis.sessionStorage.getItem("unrelated.key")).toBe("kept");
  });

  it("CONTINUING does NOT retire the attempt", async () => {
    // The other direction, against real storage. A continuation that cleared the token would end the
    // attempt the participant asked to keep going in, and the visible symptom would be a second
    // enrollment on the next screen — which is the whole defect this change's session scoping exists
    // to prevent.
    writeStoredValidatorId(ATTEMPT_ID);
    h.result = { status: "allocated", batchId: "VAL_deadbeef-2026-10-01T00:00:00.000Z" };

    await view.pressAndSettle(continueControl());

    expect(h.requests).toHaveLength(1);
    expect(globalThis.sessionStorage.getItem(KEY), "continuing must not retire the attempt").toBe(
      ATTEMPT_ID,
    );
    expect(readStoredValidatorId()).toBe(ATTEMPT_ID);
  });

  it("unmounting does NOT retire the attempt", async () => {
    // The alternative `design.md` D3 rejects: clearing in a cleanup effect. Such an effect fires on any
    // unmount, not only on the participant choosing to finish, and this is the only assertion anywhere
    // that would notice one being added — in either file, because the other file stubs the module.
    writeStoredValidatorId(ATTEMPT_ID);

    view.unmount();
    view = mount(<FinishedBatch locale="en" />);

    // Still there. A cleanup effect that cleared the token would have removed it by now, and this is
    // the assertion that would notice one being added — the `press` in the first test is the only
    // thing in the application entitled to remove this key.
    expect(globalThis.sessionStorage.getItem(KEY), "an unmount retired the attempt").toBe(
      ATTEMPT_ID,
    );
    expect(readStoredValidatorId()).toBe(ATTEMPT_ID);
  });
});

describe("what this file still cannot see", () => {
  it("says plainly that the tab-scoped and reload-surviving properties are NOT verified here", () => {
    // A guard for the file's own honesty, because the three properties that justify `sessionStorage`
    // over `localStorage` are all properties of a REAL browser session and none of them is a property
    // of an in-memory map. If a future change to this file made real-browser claims, this is the test
    // that has to be re-read, and it is here so the file cannot quietly acquire them.
    //
    // What IS measured above: that the token is removed from a working `Storage` by the real module.
    // What is NOT: that the storage is scoped to one tab, that it survives a reload, and that it
    // disappears when the tab closes. `happy-dom` cannot express any of the three.
    expect(typeof globalThis.sessionStorage).toBe("object");
    expect(document.defaultView?.sessionStorage).toBe(globalThis.sessionStorage);
    // Same object, therefore the same lifetime: there is only ONE storage here, so nothing about
    // per-tab scoping can be inferred from this environment at all.
    expect(document.defaultView?.localStorage).toBeUndefined();
  });
});
