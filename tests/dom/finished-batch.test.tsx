import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FinishedBatch } from "@/app/validate/[batchId]/finished-batch";
import { translatorFor } from "@/lib/i18n/copy";

import { mount, type Mounted } from "./support/dom-harness";

/**
 * The finished screen's two controls, driven for real.
 *
 * =================================================================================================
 * WHY EVERY GUARD HERE IS IN THIS FILE AND NOT IN `validation-routes.test.tsx`
 * =================================================================================================
 * `renderToStaticMarkup` never fires a handler. It can prove the finish control is an `<a>` with the
 * right `href` and it can COUNT both controls, and that is genuinely all it can do. Every claim below
 * is about what a press DOES — that a request leaves, that its payload is one key wide, that the new
 * batch is presented, that nothing is written when finishing is chosen — and none of them is
 * observable without a DOM that can be operated.
 *
 *   CB-1  continuing requests a batch and the new batch is PRESENTED
 *   CB-2  the request carries the identifier and NOTHING else
 *   CB-3  the allocated batch's CONTENTS never reach the document
 *   CB-4  the continue control is busy while its own request is open
 *   CB-5  two presses in one task produce exactly ONE request
 *   CB-6  an exhausted pool is reported as itself, and no batch is presented
 *   CB-7  a refused request is reported, and the control becomes usable again
 *   CB-8  finishing issues NO request and navigates through no handler
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
 */

const h = vi.hoisted(() => ({
  pushes: [] as string[],
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
  result: { status: "allocated", batchId: "VAL_deadbeef-2026-10-01T00:00:00.000Z" } as unknown,
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
    if (h.hold !== null) return h.hold.promise;
    return h.result;
  }),
}));

/**
 * The browser-local identity module, stubbed rather than driven against real `localStorage`.
 *
 * `happy-dom` in this project exposes NO `window.localStorage` — measured, not assumed: the first
 * draft of this file called `window.localStorage.setItem(...)` in `beforeEach` and every test failed
 * with `TypeError: Cannot read properties of undefined (reading 'clear')`. Stubbing is also what
 * `tests/dom/screening-form.test.tsx` does, so this follows the established pattern rather than
 * introducing a second way of setting an identity up.
 *
 * WHAT THAT COSTS, stated rather than left for a reader to find: the real `readStoredValidatorId` —
 * its format validation, its handling of an untrusted stored value, and its "clear on a malformed
 * value" side effect — is NOT exercised here. It is exercised in `tests/unit/browser-identity.test.ts`
 * against a real `Storage`, and what THIS file owns is the narrower claim that the finished screen's
 * continue control consults the module at press time and forwards whatever it says.
 */
vi.mock("@/lib/validators/browser-identity", () => ({
  readStoredValidatorId: () => {
    h.identityReads += 1;
    return h.storedId;
  },
  writeStoredValidatorId: () => {},
  clearStoredValidatorId: () => {},
}));

const t = translatorFor("en");
const NEW_BATCH = "VAL_deadbeef-2026-10-01T00:00:00.000Z";

/** The batch the finished screen was reached with. A real `defaultBatchId` shape, so it matters. */
const FINISHED_BATCH_ID = "VAL_a81d92c1-2026-09-30T20:14:03.117Z";

let view: Mounted;

function continueControl(): HTMLButtonElement {
  return view.one<HTMLButtonElement>("button");
}

function finishControl(): HTMLAnchorElement {
  return view.one<HTMLAnchorElement>("a");
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
  h.requests.length = 0;
  h.hold = null;
  h.identityReads = 0;
  h.storedId = "VAL_a81d92c1";
  h.result = { status: "allocated", batchId: NEW_BATCH };
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

describe("CB-1/CB-2 — continuing asks the server, and sends nothing but who it is for", () => {
  it("requests a batch and presents it", async () => {
    await view.pressAndSettle(continueControl());

    expect(h.requests).toHaveLength(1);
    // The new batch is PRESENTED — a navigation to the route that renders it, not a batch id parked
    // in component state. `encodeURIComponent` is applied because a real `defaultBatchId` embeds a
    // timestamp, and a raw `:` in a path segment is legal but the route is matched on the encoded
    // form, so an unencoded push would be a different URL than the one the router resolves back.
    expect(h.pushes).toEqual([`/validate/${encodeURIComponent(NEW_BATCH)}`]);
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
  it("renders no entry from the allocation response, even when the response carries them", async () => {
    // `requestBatchAction` returns the allocated batch's ENTRIES as well as its id. Reading them past
    // would put a whole batch in the browser before any of it is answered, which is the condition
    // the per-entry screen's own header exists to prevent — and a continuation path is exactly where
    // it would come back. The instruction below is a REAL one, taken from the dataset, so a guard
    // that only matched a hand-written sample would be the smaller version of the defect this
    // repository has already found once.
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { parseSyntheticDataset } = await import("@/lib/dataset/synthetic-source");
    const { entries } = parseSyntheticDataset(
      JSON.parse(readFileSync(join(process.cwd(), "data", "ilocano-synthetic-data.json"), "utf8")),
    );
    expect(entries.length, "this control read a real dataset").toBe(600);
    const instruction = entries[0].instruction;
    expect(instruction.length).toBeGreaterThan(0);

    h.result = {
      status: "allocated",
      batchId: NEW_BATCH,
      entries: [
        {
          id: entries[0].id,
          category: "origin_destination",
          instruction,
          origin: null,
          destination: null,
          transitMode: null,
        },
        {
          id: entries[1].id,
          category: "origin_destination",
          instruction: entries[1].instruction,
          origin: null,
          destination: null,
          transitMode: null,
        },
      ],
    };

    await view.pressAndSettle(continueControl());

    // Navigated, and nothing of the batch is in the document on either side of the navigation.
    expect(h.pushes).toEqual([`/validate/${encodeURIComponent(NEW_BATCH)}`]);
    expect(view.container.innerHTML).not.toContain(instruction);
    expect(view.container.innerHTML).not.toContain(entries[1].instruction);
    expect(view.container.innerHTML).not.toContain(entries[0].id);
  });
});

describe("CB-4/CB-5 — the pending state, and the single-flight latch", () => {
  it("is busy AND reports progress in text while its own request is open", async () => {
    // `design.md` open question 1, answered by measurement rather than by re-deciding: the control
    // that started the action becomes `disabled` and `aria-busy`, and its LABEL changes. It is not
    // hidden — a control that vanished is a participant told nothing — and the finish link beside it
    // is not made inert, because it is a navigation rather than an unavailable control and a
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

    // Two SYNCHRONOUS presses, before React re-renders — which is the only arrangement that can
    // expose the difference between a latch and `isPending`. `press` runs inside a synchronous `act`,
    // and two of them in a row with nothing awaited between are the same-task case the latch exists
    // for: `isPending` is still `false` on the second read.
    view.press(continueControl());
    view.press(continueControl());

    expect(h.requests).toHaveLength(1);
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
    // forgotten `case` produces. All FOUR reasons are driven, because a control that exercises two
    // would leave the other two unmeasured — the same defect the finished screen's identifier
    // control in `validation-routes.test.tsx` was caught making.
    const reasons = ["invalid", "unknown_validator", "persistence", "not_configured"] as const;
    expect(reasons).toHaveLength(4);
    expect(new Set(reasons).size).toBe(4);

    const rendered = new Map<string, string>();
    for (const reason of reasons) {
      h.result = { status: "failed", reason };
      h.requests.length = 0;
      const mounted = mount(<FinishedBatch locale="en" />);
      await mounted.pressAndSettle(mounted.one<HTMLButtonElement>("button"));
      const text =
        mounted.one<HTMLElement>('[data-decision-message="true"]').textContent?.trim() ?? "";
      expect(text.length, `reason "${reason}" rendered an empty sentence`).toBeGreaterThan(10);
      rendered.set(reason, text);
      mounted.unmount();
    }

    // And the sentences are the catalog's, not something assembled at the call site: every rendered
    // sentence is one of the three `validate.finished.failure.*` strings this change added. A branch
    // that interpolated a reason into an untranslated template would fail here by name.
    const catalog = new Set([
      t("validate.finished.failure.notConfigured"),
      t("validate.finished.failure.invalid"),
      t("validate.finished.failure.persistence"),
    ]);
    expect(catalog.size, "the three failure sentences are three distinct strings").toBe(3);
    for (const [reason, text] of rendered) {
      expect(
        catalog,
        `reason "${reason}" rendered a sentence that is not in the catalog`,
      ).toContain(text);
    }
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

describe("CB-8/CB-9 — finishing writes nothing, and the two controls are independent", () => {
  it("is a LINK with an internal href, and there is no form to submit", () => {
    // The load-bearing half of "finishing writes nothing" is the DOM tests below — that a press on it
    // issues no request. What this establishes is the SHAPE: an anchor to a route in this app, inside
    // no form, so there is no submission path for it to have.
    const finish = finishControl();

    expect(finish.tagName).toBe("A");
    expect(finish.getAttribute("href")).toBe("/");
    // INTERNAL, asserted as a shape rather than by spelling: the href must begin with a single
    // slash and must not name another origin. A link off this origin is a link this project cannot
    // vouch for, and `"//example.com"` and `"https://example.com"` are the two ways that happens
    // without an `http` substring being present.
    expect(finish.getAttribute("href")).toMatch(/^\/(?!\/)/);
    expect(view.container.querySelector("form")).toBeNull();
  });

  it("issues NO request and NO router navigation when finishing is chosen", async () => {
    await view.pressAndSettle(finishControl());

    // Not one of the two things a write or a batch request would produce. A link is a navigation, and
    // `happy-dom` does not perform one, so the honest claim is that NOTHING left the component: no
    // Server Action, no `router.push`. What a real browser would then do is follow the href, and the
    // href is a route that exists.
    expect(h.requests).toEqual([]);
    expect(h.pushes).toEqual([]);
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
    // The other direction, from a clean mount. Continuing issues its request; finishing's entire
    // observable effect is a navigation, and `happy-dom` performs no navigation — so what is asserted
    // is that finishing's href is untouched and that nothing was pushed as though it had been
    // followed.
    const hrefBefore = finishControl().getAttribute("href");
    h.result = { status: "exhausted" };
    await view.pressAndSettle(continueControl());

    expect(h.requests).toHaveLength(1);
    // Finishing was not repointed at the new batch and was not folded into the request.
    expect(finishControl().getAttribute("href")).toBe(hrefBefore);
    expect(finishControl().tagName).toBe("A");
    // And no navigation was performed on finishing's behalf: the only push is continuing's own, which
    // an exhausted outcome does not make.
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
