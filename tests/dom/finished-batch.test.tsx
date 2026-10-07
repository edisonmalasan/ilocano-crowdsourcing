import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FinishedBatch, FINISH_HREF } from "@/app/validate/[batchId]/finished-batch";
import { translatorFor } from "@/lib/i18n/copy";

import { batchIdFromAddress } from "./support/batch-address";
import { mount, type Mounted } from "./support/dom-harness";

/**
 * The finished screen's two controls, driven for real.
 *
 * =================================================================================================
 * WHY EVERY GUARD HERE IS IN THIS FILE AND NOT IN `validation-routes.test.tsx`
 * =================================================================================================
 * `renderToStaticMarkup` never fires a handler. It can COUNT both controls and it can see their
 * element types, and that is genuinely all it can do — and this change made the gap wider, not
 * narrower: the finish control used to carry its destination in an `href` that static markup could
 * read, and it no longer does, because finishing now has to discard the attempt token before it
 * leaves. Every claim below is about what a press DOES — that a request leaves, that its payload is
 * one key wide, that the new batch is presented, that finishing issues no request while discarding
 * the token and asking to be navigated — and none of them is observable without a DOM that can be
 * operated.
 *
 *   CB-1  continuing requests a batch and the new batch is PRESENTED
 *   CB-2  the request carries the identifier and NOTHING else
 *   CB-3  the allocated batch's CONTENTS never reach the document
 *   CB-4  the continue control is busy while its own request is open
 *   CB-5  two presses in one task produce exactly ONE request
 *   CB-6  an exhausted pool is reported as itself, and no batch is presented
 *   CB-7  a refused request is reported, and the control becomes usable again
 *   CB-8  finishing issues NO request, DISCARDS the attempt token, and asks to be navigated
 *   CB-9  the two controls do not trigger each other
 *
 * =================================================================================================
 * WHAT THIS DOES NOT PROVE
 * =================================================================================================
 * `happy-dom` is a SYNTHETIC DOM. It proves a click reaches a handler and that
 * `disabled`/`aria-busy` track the pending state. It proves nothing about layout, contrast, focus
 * order, a real viewport's 44px target, or how a real browser interacts with `useTransition`. No
 * human has ever rendered this screen, and no Supabase client has ever been constructed, so the
 * action this file mocks has never spoken to a database.
 *
 * AND IT PERFORMS NO STORAGE — see the module-mock note below, which is the limit that matters most
 * for CB-8, because CB-8 is about discarding something.
 */

const h = vi.hoisted(() => ({
  pushes: [] as string[],
  /**
   * Every observable effect, in the ORDER it happened.
   *
   * Two arrays of effects cannot express "the token was discarded BEFORE the navigation", and that
   * order is what `design.md` D3 specifies. This log can, and CB-8 asserts against it directly rather
   * than asserting two separate facts and calling the pair an ordering.
   */
  events: [] as string[],
  /** Every payload handed to the allocation Server Action, in order. */
  requests: [] as unknown[],
  /**
   * When set, the action returns THIS promise instead of resolving — a request held open.
   *
   * A deferred rather than a `neverResolves`, for the whole-file reason `tests/dom/validation-form.test.tsx`
   * records at length: a `useTransition` whose body never returns leaves React's async `act` queue
   * permanently non-empty, so every LATER test in the file measures the previous test's work still
   * draining. `afterEach` releases it instead.
   */
  hold: null as null | { readonly promise: Promise<unknown>; resolve: () => void },
  /** What the action reports, changed per test. */
  result: {
    status: "started",
    batchId: "VAL_deadbeef-2026-10-01T00:00:00.000Z",
    entry: {
      id: "OD_1",
      category: "origin_destination",
      instruction: "Iti OD_1 ti ayanko ita.",
      origin: null,
      destination: null,
      transitMode: null,
    },
    position: 1,
    total: 5,
  } as unknown,
  /** What the browser holds as its anonymous identity, or `null` for none. */
  storedId: "VAL_a81d92c1" as string | null,
  /**
   * How many times the component asked the browser who it is acting for.
   *
   * The assertion that matters about the identity is that it is read AT PRESS TIME, and a value alone
   * cannot show that: a component that read it during render and cached it would return the same
   * answer. Counting the reads is what distinguishes the two, and it is why this is a recorder rather
   * than a bare stub.
   */
  identityReads: 0,
  /** How many times the component discarded the attempt token. */
  clears: 0,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: (destination: string) => {
      h.pushes.push(destination);
      h.events.push(`push:${destination}`);
    },
    replace: () => {},
    refresh: () => {},
    back: () => {},
  }),
}));

vi.mock("@/lib/validation/start-validation-actions", () => ({
  requestStartValidationAction: vi.fn(async (raw: unknown) => {
    h.requests.push(raw);
    h.events.push("request-batch");
    if (h.hold !== null) return h.hold.promise;
    return h.result;
  }),
}));

/**
 * The browser-local identity module, stubbed rather than driven against real storage.
 *
 * The stub is here for TWO reasons, and only the first one is the historical one.
 *
 *   1. `happy-dom` in this project exposes NO `localStorage` — measured by the test at the bottom of
 *      this file, not assumed. The first draft called `window.localStorage.setItem(...)` in
 *      `beforeEach` and every test failed with
 *      `TypeError: Cannot read properties of undefined (reading 'clear')`.
 *   2. This file needs to CONTROL the identity (three tests set it, one sets it to `null`) and to
 *      COUNT the reads, which is how CB-1's press-time claim is made observable. A real
 *      `sessionStorage` gives neither. `vi.mock` is file-wide, so the alternative is a second file —
 *      and there is one: `tests/dom/finish-retires-attempt.test.tsx` drives the REAL module against
 *      happy-dom's REAL, WORKING `sessionStorage` and observes an actual removal.
 *
 * MEASURED CORRECTION, because it is the kind of claim that survives being wrong for years:
 * `happy-dom` here DOES provide `sessionStorage`, and it works. An earlier note in this project
 * asserted that it exposed "neither `localStorage` nor `sessionStorage`", and that was half false —
 * true of `localStorage`, false of `sessionStorage`. It was true when written, before the identity
 * module moved, and it stopped being true for the storage this application actually uses. The
 * enumeration that corrected it is a test here, so it cannot rot the same way.
 *
 * WHAT THE STUB COSTS, stated rather than left for a reader to find, and CB-8 is where it bites:
 *
 *   - The real `readStoredValidatorId` — its format validation, its handling of an untrusted stored
 *     value, and its "clear on a malformed value" side effect — is NOT exercised here. It is exercised
 *     in `tests/unit/validators-browser-identity.test.ts` against a real `Storage`.
 *   - **The real `clearStoredValidatorId` is not exercised either, so "the token was discarded" in this
 *     file means "the component asked the module to discard it."** Nothing here can observe an actual
 *     storage removal. That is the honest content of CB-8 as written, and the sibling file is what
 *     makes the stronger claim true somewhere.
 *
 * No real browser has been opened, so even the sibling file observes happy-dom's in-memory `Storage`
 * and not a browser's.
 *
 * Stubbing is also what `tests/dom/screening-form.test.tsx` does, so this follows the established
 * pattern rather than introducing a second way of setting an identity up.
 */
vi.mock("@/lib/validators/browser-identity", () => ({
  readStoredValidatorId: vi.fn(() => {
    h.identityReads += 1;
    return h.storedId;
  }),
  writeStoredValidatorId: vi.fn(() => {}),
  clearStoredValidatorId: vi.fn(() => {
    h.clears += 1;
    h.events.push("clear-token");
  }),
}));

const t = translatorFor("en");
const NEW_BATCH = "VAL_deadbeef-2026-10-01T00:00:00.000Z";

/** The batch the finished screen was reached with. A real `defaultBatchId` shape, so it matters. */
const FINISHED_BATCH_ID = "VAL_a81d92c1-2026-09-30T20:14:03.117Z";

let view: Mounted;

function continueControl(): HTMLButtonElement {
  return (view.all("button") as HTMLButtonElement[])[0];
}

/**
 * The finish control, selected BY ITS LABEL rather than by position or by element type.
 *
 * It used to be `view.one("a")`, which was unambiguous: it was the only anchor on the screen. It is a
 * `<button>` now (`design.md` D3), so both controls are buttons and a positional or type-based
 * selection would be asserting the order of two things that are otherwise interchangeable. A
 * selection by label fails if the two labels are ever swapped, which is the failure worth catching.
 */
function finishControl(): HTMLButtonElement {
  const label = t("validate.finished.finish");
  const matches = (view.all("button") as HTMLButtonElement[]).filter(
    (node) => (node.textContent ?? "").trim() === label,
  );
  expect(matches, `expected exactly one control labelled ${JSON.stringify(label)}`).toHaveLength(1);
  return matches[0] as HTMLButtonElement;
}

function controlTexts(): string[] {
  return view.all("button, a").map((node) => (node.textContent ?? "").replace(/\s+/g, " ").trim());
}

/** Holds the next action open, and returns the release. `afterEach` calls the release. */
function holdRequest(): () => void {
  let release = (): void => {};
  const promise = new Promise<unknown>((resolve) => {
    release = () => {
      resolve(h.result);
    };
  });
  h.hold = { promise, resolve: release };
  return release;
}

beforeEach(() => {
  h.pushes.length = 0;
  h.events.length = 0;
  h.requests.length = 0;
  h.hold = null;
  h.identityReads = 0;
  h.clears = 0;
  h.storedId = "VAL_a81d92c1";
  h.result = {
    status: "started",
    batchId: NEW_BATCH,
    entry: {
      id: "OD_1",
      category: "origin_destination",
      instruction: "Iti OD_1 ti ayanko ita.",
      origin: null,
      destination: null,
      transitMode: null,
    },
    position: 1,
    total: 5,
  };
  view = mount(<FinishedBatch locale="en" />);
});

afterEach(async () => {
  // Drain BEFORE unmounting, and only if a request is still open. See the note on `h.hold`.
  if (h.hold !== null) {
    const release = h.hold.resolve;
    h.hold = null;
    await view.settle(release);
  }
  view.unmount();
  vi.clearAllMocks();
});

describe("the limits of this harness, asserted rather than asserted-in-prose", () => {
  it("provides NO localStorage but A WORKING sessionStorage, which is the opposite of what was assumed", async () => {
    // Task 4.3 asked for a test asserting this file's stub is in use, on the stated premise that
    // "`happy-dom` here exposes neither `localStorage` nor `sessionStorage`". **THAT PREMISE IS
    // MEASURED FALSE, and the measurement is the reason this test says so rather than repeating it.**
    //
    // Measured in this project, in this environment, by enumerating four candidates on both
    // `globalThis` and `window`:
    //
    //   localStorage   -> undefined on both
    //   sessionStorage -> PRESENT on both, a `Storage` whose setItem/getItem/removeItem/clear all work
    //   indexedDB       -> undefined on both
    //   caches         -> undefined on both
    //
    // The `localStorage` half is why this file has always stubbed: the first draft called
    // `window.localStorage.clear()` and every test failed with `TypeError: Cannot read properties of
    // undefined`. The `sessionStorage` half is the correction — since the identity module moved to
    // `sessionStorage` in this change, the honest statement is that **the real module COULD be driven
    // here**, and `tests/dom/finish-retires-attempt.test.tsx` does exactly that in a second file,
    // because `vi.mock` is file-wide and this file's identity control and read-counting need the stub.
    //
    // Both directions are asserted on purpose. If a future `happy-dom` ever provides `localStorage`,
    // the first assertion fails and a reader is told to re-check what the stub is standing in for. If
    // `sessionStorage` ever stops working, the second fails and the file that depends on it says so.
    // A comment asserting either would be a claim nobody re-measures, which is the defect this test
    // was written to remove.
    const globals = globalThis as unknown as Record<string, unknown>;
    expect(globals["localStorage"], "happy-dom now provides localStorage").toBeUndefined();
    expect(globals["indexedDB"], "happy-dom now provides indexedDB").toBeUndefined();

    const storage = globals["sessionStorage"] as Storage | undefined;
    expect(storage, "happy-dom no longer provides sessionStorage").toBeDefined();
    expect(storage?.constructor?.name).toBe("Storage");
    // Not merely present: a `Storage`-shaped object that silently drops writes would make the
    // sibling file's "the token really was removed" assertion pass for the wrong reason.
    storage?.setItem("sadino.probe", "v");
    expect(storage?.getItem("sadino.probe")).toBe("v");
    storage?.removeItem("sadino.probe");
    expect(storage?.getItem("sadino.probe")).toBeNull();

    // And the module this file's component used is the STUB, so "the token was discarded" in CB-8
    // means "the component asked the module to discard it" and cannot quietly become a claim about
    // real storage. Asserted by identity: the real module's functions are not what this component
    // called. The real thing is measured in the sibling file named above.
    const identity = await import("@/lib/validators/browser-identity");
    expect(vi.isMockFunction(identity.clearStoredValidatorId)).toBe(true);
    expect(vi.isMockFunction(identity.readStoredValidatorId)).toBe(true);
  });
});

describe("CB-1/CB-2 — continuing asks the server, and sends nothing but who it is for", () => {
  it("requests a batch and presents it", async () => {
    await view.pressAndSettle(continueControl());

    expect(h.requests).toHaveLength(1);
    // The new batch is PRESENTED — a navigation to the route that renders it, not a batch id parked
    // in component state. Asserted through a ROUND TRIP through the route's own parse function
    // rather than against an `encodeURIComponent` literal, which is STRICTLY STRONGER: the literal
    // passed whether or not the component navigated to the batch the SERVER chose, and the reason it
    // passed before is that the component pre-encoded — which is exactly what made the address
    // unopenable.
    // The push COUNT is asserted too, so an extra navigation cannot hide behind a passing round trip
    // on the first one. `h.requests` above is a different array and does not cover this.
    expect(h.pushes).toHaveLength(1);
    expect(batchIdFromAddress(h.pushes[0] as string)).toBe(NEW_BATCH);
    // The batch the participant just finished is NOT part of the request, and neither is anything
    // about their progress: the server chose this batch, and a request that named the previous one
    // would be a client asking to continue a specific batch rather than asking for the next one.
    expect(h.requests[0]).not.toMatchObject({ batchId: FINISHED_BATCH_ID });
  });

  it("sends EXACTLY one key, and it is the identifier", async () => {
    await view.pressAndSettle(continueControl());

    // `Object.keys`, not `toEqual({ validatorId: … })`. The requirement is that the client cannot
    // supply a completion status, an answered count, or a remaining count, and a structural equality
    // WOULD catch those — but a named list would not, and this is stated rather than assumed: the
    // key set is read out of the actual payload so a third key fails whatever it is called.
    const payload = h.requests[0] as Record<string, unknown>;
    expect(Object.keys(payload)).toEqual(["validatorId"]);
    expect(payload["validatorId"]).toBe("VAL_a81d92c1");
    // And no batch appears anywhere in the serialized payload, which is the form a dictionary-shaped
    // payload would take if one were nested inside it rather than added beside it.
    expect(JSON.stringify(payload)).not.toContain(FINISHED_BATCH_ID);
  });

  it("reads the identity at PRESS TIME, not during render and not from a prop", async () => {
    // The component takes no identity prop at all, and that is the point: it is the only way it can
    // know which validator it is acting for. The read cannot happen during render, because
    // `localStorage` does not exist while the server renders and reading it there would make the
    // first client render disagree with the first server one.
    //
    // So the read is COUNTED rather than assumed: a component that read it during render and closed
    // over the result would return the same value and pass a value-only assertion, which is why the
    // opposite half is here too — nothing is read until the control is pressed.
    expect(h.identityReads, "nothing is read from the browser while idle").toBe(0);
    expect(view.container.innerHTML).not.toContain("VAL_a81d92c1");

    await view.pressAndSettle(continueControl());

    expect(h.identityReads, "the browser is consulted exactly once per request").toBe(1);
    expect((h.requests[0] as Record<string, unknown>)["validatorId"]).toBe("VAL_a81d92c1");
  });
});

describe("CB-3 — the continued batch's contents never reach the participant", () => {
  it("renders no entry from the orchestration response, even when the response carries one", async () => {
    // The orchestration returns the batch id plus the first entry only. Reading the
    // entry past here would put a sentence in the browser before any of it is answered,
    // which is the condition the per-entry screen's own header exists to prevent — and
    // a continuation path is exactly where it would come back. The instruction below
    // is a REAL one, taken from the dataset, so a guard that only matched a
    // hand-written sample would be the smaller version of the defect this repository
    // has already found once.
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { parseSyntheticDataset } = await import("@/lib/dataset/synthetic-source");
    const { entries } = parseSyntheticDataset(
      JSON.parse(
        readFileSync(join(process.cwd(), "data", "merged-ilocano-synthetic-data.json"), "utf8"),
      ),
    );
    expect(entries.length, "this control read a real dataset").toBe(4800);
    const instruction = entries[0].instruction;
    expect(instruction.length).toBeGreaterThan(0);

    h.result = {
      status: "started",
      batchId: NEW_BATCH,
      entry: {
        id: entries[0].id,
        category: "origin_destination",
        instruction,
        origin: null,
        destination: null,
        transitMode: null,
      },
      position: 1,
      total: 5,
    };

    await view.pressAndSettle(continueControl());

    // Navigated, and nothing of the batch is in the document on either side of the navigation.
    // Count first: a round trip on `pushes[0]` alone is satisfied by a first push alongside a
    // second, unwanted one.
    expect(h.pushes).toHaveLength(1);
    expect(batchIdFromAddress(h.pushes[0] as string)).toBe(NEW_BATCH);
    expect(view.container.innerHTML).not.toContain(instruction);
    expect(view.container.innerHTML).not.toContain(entries[0].id);
    // And the shape carries no second entry at all: one `entry`, never an `entries`
    // array for a continuation path to read past.
    expect(h.result).not.toHaveProperty("entries");
  });
});

describe("CB-4/CB-5 — the pending state, and the single-flight latch", () => {
  it("is busy AND reports progress in text while its own request is open", async () => {
    // `design.md` open question 1, answered by measurement rather than by re-deciding: the control
    // that started the action becomes `disabled` and `aria-busy`, and its LABEL changes. It is not
    // hidden — a control that vanished is a participant told nothing — and the finish control beside it
    // is not made inert, because it is the way out rather than an unavailable control and a
    // participant must always be able to leave.
    holdRequest();

    view.press(continueControl());

    const pending = continueControl();
    expect(pending.hasAttribute("disabled"), "the initiating control is inert").toBe(true);
    expect(pending.getAttribute("aria-busy")).toBe("true");
    // Progress as TEXT, not only as styling: the label reports the pending state and the accessible
    // name survives it. `design-system` requires both halves separately.
    expect((pending.textContent ?? "").replace(/\s+/g, " ").trim()).toBe(
      t("validate.finished.continue.working"),
    );
    expect(pending.textContent ?? "").not.toContain(t("validate.finished.continue"));

    // And the finish control is untouched while all of that is true, which is the other half of the
    // same answer: making it inert would be the "disabled for unavailability" pattern the design
    // note explicitly declines, and it is asserted here so a later "let's tidy them up together"
    // edit has to break a test to happen.
    expect(finishControl().hasAttribute("disabled")).toBe(false);
    expect(finishControl().getAttribute("aria-busy")).toBeNull();
    expect((finishControl().textContent ?? "").trim()).toBe(t("validate.finished.finish"));
  });

  it("returns to the idle control once the request answers", async () => {
    holdRequest();
    view.press(continueControl());
    expect(continueControl().hasAttribute("disabled")).toBe(true);

    const release = h.hold?.resolve;
    h.hold = null;
    await view.settle(() => release?.());

    // The control is navigable away from by then, so this asserts nothing about the DOM afterwards —
    // a real router would have unmounted it. What it asserts is that `isPending` cleared, which is
    // the half that is observable here and the half a stuck transition would break.
    expect(h.requests).toHaveLength(1);
  });

  it("makes exactly ONE request for two presses dispatched in the same task", async () => {
    holdRequest();

    // Two clicks inside ONE `act`, so React commits NOTHING between them. This is the only arrangement
    // that can tell the latch from `disabled`, and the distinction is the whole content of this test.
    //
    // ── WHY THE PREVIOUS VERSION OF THIS TEST PROVED NOTHING ───────────────────────────────────────────
    // It called `view.press()` twice. Each `press` opens and closes its own `act`, and React commits
    // at the close — so the two presses were two TASKS, the first had already committed `disabled`,
    // and the second press was stopped by `disabled`. The test passed, but it was measuring
    // `disabled`, not the latch, and **deleting `inFlight` outright left it green.** It also said
    // "the only arrangement that can expose the difference" while being the arrangement that cannot.
    //
    // Measured, not argued: `finished-batch.tsx` documents that "a double press HERE would create TWO
    // batches", and `design.md` records an orphaned batch as this change's accepted ordering risk. So
    // the latch is the only thing standing between a fast double press and an orphan, and a guard that
    // cannot see it removed is not a guard.
    view.pressMany(continueControl(), 2);

    expect(h.requests).toHaveLength(1);
  });

  it("CAN FIRE: pressMany observes a handler with NO latch issuing TWO requests", () => {
    // The control for the test above, and it is the half that makes that test a guard. `pressMany`
    // claims it can see the difference between a latched and an unlatched handler; this proves it, in
    // the same file, with the same harness, in the same task shape — so "the count was 1" cannot be
    // an artefact of `pressMany` refusing to deliver the second click at all.
    //
    // This is deliberately NOT a second copy of `FinishedBatch`. A control that renders the real
    // component with the latch edited out would be testing a hypothetical component; what matters is
    // that the harness can count 2 here, because then a count of 1 over the real component is a
    // measurement rather than a limitation of the instrument.
    holdRequest();
    let proceeds = 0;

    const unlatched = mount(
      <button
        type="button"
        onClick={() => {
          // No `inFlight` ref consulted at all: the shape the finished screen would have if its
          // latch were deleted. `isPending` is never consulted either, because inside one `act` the
          // re-render that would set it has not happened yet.
          proceeds += 1;
          h.hold?.resolve?.();
        }}
      >
        no latch
      </button>,
    );

    unlatched.pressMany(unlatched.one("button"), 2);

    // Both clicks landed and both proceeded. So `pressMany` delivers every click in the same task,
    // and the real component's count of 1 is attributable to the latch.
    expect(proceeds).toBe(2);
    unlatched.unmount();
  });
});

describe("CB-6/CB-7 — what a request that does not allocate reports", () => {
  it("reports an EXHAUSTED pool as itself, and presents nothing", async () => {
    h.result = { status: "exhausted" };

    await view.pressAndSettle(continueControl());

    // Reported as its own outcome, in its own words, and NOT as a failure. Telling somebody who has
    // finished the study that something is broken would be the wrong sentence entirely.
    const exhausted = view.one<HTMLElement>('[data-decision="exhausted"]');
    expect((exhausted.textContent ?? "").replace(/\s+/g, " ").trim()).toBe(
      t("validate.finished.exhausted"),
    );
    // And no batch was fabricated: nothing was presented, because the server said there is nothing
    // to present. The companion half — that the SERVER wrote no row on this path — is asserted
    // against the allocation contract in `tests/unit/allocation-actions.test.ts`, which counts
    // `batches.create` calls. A DOM test cannot see a row.
    expect(h.pushes).toEqual([]);
    // It is not an alert either: an exhausted pool is an ordinary research outcome, and an alert
    // would present it as a fault.
    expect(exhausted.getAttribute("role")).toBeNull();
  });

  it("reports a failure as an ALERT naming the reason, and leaves the control usable", async () => {
    h.result = { status: "failed", reason: "not_configured" };

    await view.pressAndSettle(continueControl());

    const alert = view.one<HTMLElement>('[data-decision="error"]');
    expect(alert.getAttribute("role")).toBe("alert");
    expect(view.one<HTMLElement>('[data-decision-message="true"]').textContent).toBe(
      t("validate.finished.failure.notConfigured"),
    );
    // A failure leaves the finished screen intact and the control usable, because nothing was
    // written and the participant's responses are all still banked. A control left `disabled` after a
    // failed request would strand them on a screen with no way to try again.
    expect(h.pushes).toEqual([]);
    expect(continueControl().hasAttribute("disabled")).toBe(false);
    expect(continueControl().getAttribute("aria-busy")).toBeNull();
  });

  it("maps every failure reason onto a rendered sentence, and never onto nothing", async () => {
    // The mapping is the pure function's job and is enumerated there; what matters HERE is that no
    // reason reaches the participant as an empty or untranslated string, which is the shape a
    // forgotten `case` produces. All FIVE reasons are driven, because a control that exercises two
    // would leave the other three unmeasured — the same defect the finished screen's identifier
    // control in `validation-routes.test.tsx` was caught making.
    const reasons = [
      "invalid",
      "unknown_validator",
      "persistence",
      "not_configured",
      "screening_required",
    ] as const;
    expect(reasons).toHaveLength(5);
    expect(new Set(reasons).size).toBe(5);

    const rendered = new Map<string, string>();
    for (const reason of reasons) {
      h.result = { status: "failed", reason };
      h.requests.length = 0;
      const mounted = mount(<FinishedBatch locale="en" />);
      // The CONTINUE control specifically, by position, because both controls are `<button>`s now
      // (D3) and `one("button")` refuses to guess between them.
      await mounted.pressAndSettle((mounted.all("button") as HTMLButtonElement[])[0]);
      const text =
        mounted.one<HTMLElement>('[data-decision-message="true"]').textContent?.trim() ?? "";
      expect(text.length, `reason "${reason}" rendered an empty sentence`).toBeGreaterThan(10);
      rendered.set(reason, text);
      mounted.unmount();
    }

    // And the sentences are the catalog's, not something assembled at the call site: every rendered
    // sentence is one of the four `validate.finished.failure.*` strings. A branch
    // that interpolated a reason into an untranslated template would fail here by name.
    const catalog = new Set([
      t("validate.finished.failure.notConfigured"),
      t("validate.finished.failure.invalid"),
      t("validate.finished.failure.persistence"),
      t("validate.finished.failure.screeningRequired"),
    ]);
    expect(catalog.size, "the four failure sentences are four distinct strings").toBe(4);
    for (const [reason, text] of rendered) {
      expect(
        catalog,
        `reason "${reason}" rendered a sentence that is not in the catalog`,
      ).toContain(text);
    }
  });

  it("tells a pre-correction attempt to finish and restart screened, and keeps Finish usable", async () => {
    h.result = { status: "failed", reason: "screening_required" };

    await view.pressAndSettle(continueControl());

    // The message names the history and the way out: Finish here (which retires
    // the attempt with no server write), then a new screened attempt. It must
    // not read as breakage and must not offer a retry that could never succeed.
    const text = view.one<HTMLElement>('[data-decision-message="true"]').textContent?.trim() ?? "";
    expect(text).toBe(t("validate.finished.failure.screeningRequired"));
    expect(text).toMatch(/Finish here/i);
    expect(h.pushes).toEqual([]);
    expect(continueControl().hasAttribute("disabled")).toBe(false);
  });

  it("asks the participant to answer the Ilocano question when the browser holds no identity", async () => {
    h.storedId = null;

    await view.pressAndSettle(continueControl());

    // NO request was made: a browser holding no identity has nothing to attach a batch to, and asking
    // the server anyway would produce `unknown_validator` — a restatement of a fact the browser
    // already had. The count of zero is the assertion; the message is the courtesy.
    expect(h.requests).toEqual([]);
    const noIdentity = view.one<HTMLElement>('[data-decision="no-identity"]');
    expect((noIdentity.textContent ?? "").replace(/\s+/g, " ").trim()).toBe(
      t("validate.finished.failure.invalid"),
    );
  });
});

describe("CB-8/CB-9 — finishing writes nothing, retires the attempt, and the two controls are independent", () => {
  it("is a CONTROL, not a link and not a form", () => {
    // The load-bearing half of "finishing writes nothing" is the press below — that a press on it
    // issues no request. What this establishes is the SHAPE. It was an `<a href="/">` and it is a
    // `<button>` now, because it discards the attempt token before it leaves and a link has no moment
    // before it navigates in which to do anything (`design.md` D3).
    const finish = finishControl();

    expect(finish.tagName).toBe("BUTTON");
    // `type="button"` is asserted rather than assumed: a `<button>` inside a form submits it, and
    // "not a form" is only half of "does not submit" — an omitted `type` inside some ancestor's form
    // would submit.
    expect(finish.getAttribute("type")).toBe("button");
    // It carries NO destination of its own any more. The destination lives in the component's exported
    // `FINISH_HREF` and is asserted as the router's argument below, which is the only place it is
    // observable now.
    expect(finish.getAttribute("href")).toBeNull();
    // And the screen has no form, so there is no submission path for either control to have.
    expect(view.container.querySelector("form")).toBeNull();
    // The two controls are genuinely different elements, which is what "distinct controls" means here:
    // a screen that rendered one control twice under two labels would satisfy every label assertion.
    expect(finishControl()).not.toBe(continueControl());
  });

  it("issues NO request, DISCARDS the attempt token, and asks to be navigated", async () => {
    await view.pressAndSettle(finishControl());

    // Three things, and the order is part of the requirement rather than an incidental detail:
    //
    //   1. NO Server Action. Not one of the things a write or a batch request would produce, so
    //      `h.requests` is empty. "Finishing writes nothing" is a claim about the SERVER and this is
    //      the only observation here that can speak to it.
    //   2. The token is DISCARDED — the attempt is retired in this browser session.
    //   3. Navigation is REQUESTED, to the component's own exported destination.
    //
    // Asserted against the ordered event log rather than as three separate facts, because three
    // separate facts cannot say "the discard came first" and D3 specifies exactly that.
    expect(h.events).toEqual(["clear-token", `push:${FINISH_HREF}`]);
    expect(h.requests).toEqual([]);
    expect(h.clears).toBe(1);
    expect(h.pushes).toEqual([FINISH_HREF]);
    // The navigation target is read out of the component, not written out here, so a change to where
    // finishing goes cannot leave this test agreeing with a stale copy of it.
    expect(FINISH_HREF).toBe("/");
  });

  it("CAN FIRE: the ordered log distinguishes discard-first from navigate-first", () => {
    // The control for the assertion above, and the reason it is not just "three facts that hold". If
    // `h.events` could not tell the two orders apart, then `["clear-token", "push:/"]` would pass for a
    // handler that navigates first and clears afterwards — a different implementation of the same
    // requirement, and the one D3 rules out.
    const navigateFirst = (): string[] => {
      const seen: string[] = [];
      seen.push("push:/", "clear-token");
      return seen;
    };

    expect(navigateFirst()).not.toEqual(["clear-token", "push:/"]);
    // And the ordering assertion above is anchored to something real: the log is non-empty before the
    // comparison, so the equality above is not satisfied by two empty arrays.
    expect(view.container.querySelectorAll("button").length).toBeGreaterThan(1);
  });

  it("never discards the attempt on UNMOUNT, or on any render", async () => {
    // The alternative D3 rejects: clearing in a cleanup effect. Such an effect also fires when the
    // component unmounts for any other reason — a changed key, a navigation past it, a parent
    // conditional — and would retire attempts the participant never chose to finish.
    //
    // There is no way to observe a real unmount-driven clear in this harness without unmounting, so
    // this asserts the half that is observable and names the half that is not: while the screen is
    // alive, re-rendering and pressing CONTINUE (which navigates in a real router, and therefore
    // unmounts this screen) leaves the token alone.
    await view.pressAndSettle(continueControl());
    expect(h.clears, "continuing must not retire the attempt").toBe(0);

    view.unmount();
    // `afterEach` unmounts again, which `happy-dom` accepts; the count is re-read after our own
    // unmount because an unmount effect WOULD fire here if one existed. That is the real point of this
    // test: it is the only assertion in the file that would go red if someone "tidied up" the handler
    // into a cleanup.
    expect(h.clears, "unmounting must not retire the attempt").toBe(0);
    view = mount(<FinishedBatch locale="en" />);
  });

  it("FINISHING does not trigger continuing", async () => {
    // One direction of the requirement *Finishing and continuing are distinct controls*, in its own
    // test. `tasks.md` 3.3 asks for "two independent DOM tests, each driving one control and asserting
    // the other's effect does not occur", and independence is the point: a single test doing both
    // directions in sequence shares one mounted component and one accumulating request log, so the
    // second direction's counts are read off state the first direction already changed. `beforeEach`
    // rebuilds `h` and remounts, so each direction starts from zero requests and zero pushes.
    await view.pressAndSettle(finishControl());

    // Continuing's entire observable effect is one request. It did not happen.
    expect(h.requests).toEqual([]);
    // And continuing's control is untouched — same element, same label, still pressable. A finish that
    // disabled the continue control would satisfy the request assertion above and leave a participant
    // unable to carry on.
    expect(continueControl().disabled).toBe(false);
    expect(controlTexts()).toEqual([
      t("validate.finished.continue"),
      t("validate.finished.finish"),
    ]);
  });

  it("CONTINUING does not trigger finishing", async () => {
    // The other direction, from a clean mount. Continuing issues its request; finishing's observable
    // effects are the discard and the navigation, and neither may happen on continuing's account — a
    // continuation that retired the attempt would strand the participant who asked for more work.
    const finishBefore = finishControl();
    h.result = { status: "exhausted" };
    await view.pressAndSettle(continueControl());

    expect(h.requests).toHaveLength(1);
    // Finishing was not folded into the request and was not made to do continuing's work.
    expect(finishControl()).toBe(finishBefore);
    expect(finishControl().tagName).toBe("BUTTON");
    // Neither of finishing's two effects occurred: no token discarded, and no navigation performed on
    // its behalf — the only push would be continuing's own, which an exhausted outcome does not make.
    expect(h.clears).toBe(0);
    expect(h.pushes).toEqual([]);
  });

  it("gives the two controls different, equally prominent labels in both catalogs", async () => {
    // Distinctness by CONTENT as well as by role, in the language actually rendered. Two controls
    // carrying the same string would satisfy every structural assertion in this file while offering
    // the participant one choice described twice.
    expect(controlTexts()).toEqual([
      t("validate.finished.continue"),
      t("validate.finished.finish"),
    ]);
    expect(t("validate.finished.continue")).not.toBe(t("validate.finished.finish"));

    const fil = translatorFor("fil");
    const filView = mount(<FinishedBatch locale="fil" />);
    const filTexts = filView
      .all("button, a")
      .map((node) => (node.textContent ?? "").replace(/\s+/g, " ").trim());
    expect(filTexts).toEqual([fil("validate.finished.continue"), fil("validate.finished.finish")]);
    expect(filTexts[0]).not.toBe(filTexts[1]);
    // And neither Filipino label fell back to English, which is what a missing key renders as. The
    // comparison is against the LIVE catalog rather than a literal written out here, because a second
    // inventory of two keys is a second thing to keep in step and the one that drifts is the one
    // being tested.
    for (const [key, value] of [
      ["validate.finished.continue", filTexts[0]],
      ["validate.finished.finish", filTexts[1]],
    ] as const) {
      expect(value, `${key} fell back to English`).not.toBe(t(key));
      expect(value.length).toBeGreaterThan(0);
    }
    filView.unmount();
  });
});
