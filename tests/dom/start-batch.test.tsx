import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StartBatch } from "@/app/validate/start-batch";
import { ENGLISH_COPY, FILIPINO_COPY, translatorFor, type CopyKey } from "@/lib/i18n/copy";

import { mount, type Mounted } from "./support/dom-harness";

/**
 * `/validate`'s island with the resume affordance on screen — driven for real.
 *
 * =================================================================================================
 * WHY THIS IS A SEPARATE FILE AND NOT A SECTION OF `validation-routes.test.tsx`
 * =================================================================================================
 * Two of the claims below are about a mount EFFECT and a conditional LINK, and neither is reachable
 * from `renderToStaticMarkup`:
 *
 *   - the lookup is issued on MOUNT, without the participant pressing anything. A server-rendered
 *     string of this component contains no offer at all, because the offer cannot exist until a
 *     browser has answered — so the whole feature is invisible to the static renderer.
 *   - pressing `Start a batch` still issues its allocation request WHILE a resume offer is on screen.
 *     That is a click, and a click needs a DOM that can be operated.
 *
 * The static route test therefore still passes unchanged, which is correct rather than lucky: it
 * asserts about the SERVER-rendered markup, and this file asserts about the client-rendered screen.
 * Those are different screens.
 *
 *   RC-1  the lookup is issued on mount, with the stored identifier and nothing else
 *   RC-2  an offer produces a link to the batch, and the counts read as REMAINING
 *   RC-3  no offer, a failed lookup, and an in-flight lookup all render the SAME markup
 *   RC-4  pressing `Start a batch` still works, with the offer on screen
 *   RC-5  the offer reveals exactly one identifier, and it is the one in the href
 *   RC-6  the start control is never disabled by anything recovery does
 *
 * =================================================================================================
 * WHAT THIS DOES NOT PROVE
 * =================================================================================================
 * `happy-dom` is a SYNTHETIC DOM. It proves a mount effect fires, that a conditional link appears, and
 * that a click reaches a handler. It proves nothing about layout, contrast, focus order, or a real
 * viewport. No human has ever rendered this screen. Both Server Actions are mocked, so nothing here
 * has spoken to a database — no Supabase credential exists in this repository.
 */

const h = vi.hoisted(() => ({
  pushes: [] as string[],
  /** Payloads handed to the ALLOCATION action. */
  allocations: [] as unknown[],
  /** Payloads handed to the RECOVERY action. */
  lookups: [] as unknown[],
  /** Set to hold the recovery action open, so the in-flight markup is observable. */
  hold: null as null | { readonly promise: Promise<unknown>; resolve: (value: unknown) => void },
  /** What the recovery action reports, changed per test. */
  lookupResult: {
    status: "interrupted",
    offer: { batchId: "VAL_a81d92c1-2026-09-30T20:14:03.117Z", remaining: 4, total: 10 },
  } as unknown,
  /** What the allocation action reports. */
  allocationResult: {
    status: "allocated",
    batchId: "VAL_fresh99-2026-10-02T00:00:00.000Z",
  } as unknown,
  /** What the browser holds, or `null`. */
  storedId: "VAL_a81d92c1" as string | null,
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
    h.allocations.push(raw);
    return h.allocationResult;
  }),
}));

vi.mock("@/lib/validation/recovery-actions", () => ({
  requestInterruptedBatchAction: vi.fn(async (raw: unknown) => {
    h.lookups.push(raw);
    if (h.hold !== null) return h.hold.promise;
    return h.lookupResult;
  }),
}));

/**
 * `happy-dom` in this project exposes no `window.localStorage`, so the identity module is stubbed
 * exactly as `finished-batch.test.tsx` does. What that costs is stated there and it is the same here:
 * the real `readStoredValidatorId` is exercised in `tests/unit/browser-identity.test.ts`, and what
 * THIS file owns is that the island consults the module and forwards whatever it says.
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
const REAL_BATCH = "VAL_a81d92c1-2026-09-30T20:14:03.117Z";

let view: Mounted;

/** The single `<button>`. The resume affordance is a link, so `one("button")` stays unambiguous. */
function startControl(): HTMLButtonElement {
  return view.one<HTMLButtonElement>("button");
}

/** The resume link, or `null` when there is none. Never a bare `?.` chain. */
function resumeLink(): HTMLAnchorElement | null {
  const found = view.all('a[href^="/validate/"]');
  if (found.length === 0) return null;
  if (found.length !== 1) {
    throw new Error(`expected at most one resume link but found ${found.length}`);
  }
  return found[0] as HTMLAnchorElement;
}

/**
 * Mounts fresh after the recovery effect has been allowed to answer.
 *
 * ASSIGNS to `view`, so `afterEach` unmounts a live component. A test that unmounts `view` itself and
 * then mounts a local one would leave `afterEach` unmounting an already-unmounted root, and React
 * warns about that — a suite that emits warnings is a suite nobody re-reads carefully, which is the
 * reason `tests/dom/validation-form.test.tsx` went back and removed ninety-five of them.
 */
async function mountSettled(): Promise<Mounted> {
  const mounted = mount(<StartBatch locale="en" />);
  await mounted.settle();
  view = mounted;
  return mounted;
}

/** Unmounts whatever `view` currently holds, so the next `mountSettled` is the only live component. */
function unmountCurrent(): void {
  view.unmount();
}

/**
 * Holds the NEXT recovery action open, and returns nothing — the release is `h.hold.resolve`.
 *
 * A deferred rather than a `neverResolves`, for the whole-file reason
 * `tests/dom/finished-batch.test.tsx` records: a promise that never returns leaves React's async `act`
 * queue permanently non-empty, so every LATER test measures this one's work still draining.
 */
function holdLookup(): void {
  let release: (value: unknown) => void = () => {};
  const promise = new Promise<unknown>((resolve) => {
    release = resolve;
  });
  h.hold = { promise, resolve: release };
}

beforeEach(async () => {
  h.pushes.length = 0;
  h.allocations.length = 0;
  h.lookups.length = 0;
  h.hold = null;
  h.identityReads = 0;
  h.storedId = "VAL_a81d92c1";
  h.lookupResult = {
    status: "interrupted",
    offer: { batchId: REAL_BATCH, remaining: 4, total: 10 },
  };
  h.allocationResult = { status: "allocated", batchId: "VAL_fresh99-2026-10-02T00:00:00.000Z" };
  view = await mountSettled();
});

afterEach(async () => {
  if (h.hold !== null) {
    const release = h.hold.resolve;
    h.hold = null;
    await view.settle(() => release({ status: "none" }));
  }
  view.unmount();
  vi.clearAllMocks();
});

describe("RC-1 — the lookup is issued on mount, and carries only the identifier", () => {
  it("asks on mount without the participant doing anything", async () => {
    // The island had rendered, flushed, and committed before this assertion runs, and the request is
    // already recorded. There is no press anywhere in this test, and that is the requirement: a
    // participant who returns to `/validate` is offered their own unfinished work without being asked
    // to go looking for it.
    expect(h.lookups).toHaveLength(1);
    expect((h.lookups[0] as Record<string, unknown>)["validatorId"]).toBe("VAL_a81d92c1");
  });

  it("sends EXACTLY one key, and it is the identifier", async () => {
    // The requirement `tasks.md` 6.1 makes about the intent: a client cannot NAME a batch, so there is
    // no request in which a batch could be named. `Object.keys` rather than a structural equality, so
    // a third key fails whatever it is called.
    const payload = h.lookups[0] as Record<string, unknown>;
    expect(Object.keys(payload)).toEqual(["validatorId"]);
    // And no batch id appears anywhere in the serialized payload, which is what a nested or
    // dictionary-shaped batch reference would look like rather than an extra top-level key.
    expect(JSON.stringify(payload)).not.toContain("batchId");
  });

  it("issues NO request at all when the browser holds no identifier", async () => {
    h.storedId = null;
    // The `beforeEach` mount already issued one lookup, so the log is CLEARED rather than read. Not a
    // detail: asserting `toEqual([])` against a log holding the previous mount's entry would fail for
    // a reason that has nothing to do with this test, and "clear first" is the difference between
    // measuring this mount and measuring the harness.
    h.lookups.length = 0;
    const mounted = await mountSettled();

    // A browser with no identity cannot have been enrolled, so the server would refuse — and a
    // request nobody asked for is a query spent to learn something the browser already knew.
    expect(h.lookups).toEqual([]);
    expect(resumeLinkOf(mounted)).toBeNull();
    mounted.unmount();
  });
});

describe("RC-2 — what an offer shows", () => {
  it("offers a LINK to the batch's own address, with no handler", async () => {
    const link = resumeLink();

    expect(link).not.toBeNull();
    expect(link!.tagName).toBe("A");
    // `encodeURIComponent`, because a real `defaultBatchId` embeds a timestamp and the route resolves
    // on the encoded form. `start-batch.tsx` documents why the round trip matters.
    expect(link!.getAttribute("href")).toBe(`/validate/${encodeURIComponent(REAL_BATCH)}`);
    // No handler at all: `design.md` D6. Asserted by pressing it below and watching nothing leave.
    expect(link!.getAttribute("role")).toBeNull();
  });

  it("reads as REMAINING, and never as answered or as a contribution total", () => {
    const count = view.one<HTMLElement>('[data-recovery-count="true"]');
    const text = (count.textContent ?? "").replace(/\s+/g, " ").trim();

    // "4 of 10", in the order the catalog composes it. The figure the participant reads is what is
    // LEFT, which is the only version of it that describes work they have already been given; a count
    // of what they have answered reads as a running total, and `design.md` D7 forbids that.
    expect(text).toBe(
      `4 ${t("validateStart.resume.remaining.connector")} 10 ${t("validateStart.resume.remaining.unit")}`,
    );
    // Not the other figure. This is the negative half, and it is written against the SPECIFIC words a
    // contribution total would use rather than against the number — "4" appears in both.
    expect(text).not.toContain(t("validate.finished.lifetimeFigureLabel"));
    expect(text).not.toContain(t("validate.finished.batchFigureLabel"));
    expect(text).not.toMatch(/answered/i);
  });

  it("pressing the resume link issues NO request", async () => {
    const link = resumeLink()!;
    await view.pressAndSettle(link);

    // A link with no handler writes nothing, and `happy-dom` performs no navigation — so the honest
    // claim is that NOTHING left the component: no allocation request, no recovery re-lookup, no push.
    // What a real browser would then do is follow the href, and the href is a route that exists.
    expect(h.allocations).toEqual([]);
    expect(h.lookups).toHaveLength(1);
    expect(h.pushes).toEqual([]);
  });
});

describe("RC-3 — none, unavailable, and in-flight render the SAME screen", () => {
  it("renders byte-identical markup for `none` and for every failure reason", async () => {
    // `design.md` D4. Every reason is driven and compared against `none`, and the comparison is of the
    // WHOLE markup rather than of the absence of a string — "both show nothing" would pass on a screen
    // that showed nothing for an unrelated reason.
    //
    // The `beforeEach` mount is unmounted FIRST and the baseline taken from a fresh one, because the
    // default `beforeEach` leaves an OFFER on screen. Comparing a failure screen against a screen that
    // is still showing an offer would fail for a reason unrelated to D4, and the fix that is easy to
    // reach for — deleting the offer markup from both sides with a regex — would destroy the very
    // difference the test exists to detect.
    unmountCurrent();
    h.lookupResult = { status: "none" };
    const baselineMount = await mountSettled();
    const baseline = baselineMount.container.innerHTML;
    baselineMount.unmount();

    for (const reason of [
      "invalid",
      "unknown_validator",
      "unavailable",
      "not_configured",
    ] as const) {
      h.lookupResult = { status: "failed", reason };
      const mounted = await mountSettled();
      expect(mounted.container.innerHTML, `reason ${reason} rendered differently`).toBe(baseline);
      expect(resumeLinkOf(mounted), `reason ${reason} rendered an offer`).toBeNull();
      // And no alert appeared either. A failure that grew an `alert` role would be a message about our
      // infrastructure, and this asserts the absence of the ROLE rather than of a sentence — so a
      // differently-worded message could not slip past by being phrased differently.
      expect(mounted.all('[role="alert"]').length, `reason ${reason} rendered an alert`).toBe(0);
      mounted.unmount();
    }
  });

  it("renders the SAME markup while the lookup is still in flight", async () => {
    // Not merely "eventually the same". While the request is open the screen is already the complete
    // start screen — no spinner, no disabled button, no placeholder — because D3 makes the lookup
    // additive and a screen that waited for it would turn a slow query into an unavailable study.
    //
    // The request is HELD rather than made slow: `mount` runs the effect synchronously, and without a
    // held promise the answer arrives in the same microtask flush that `settle` performs, so there
    // would be no window in which to observe anything. Holding is also what `afterEach` releases.
    unmountCurrent();
    holdLookup();
    const held = mount(<StartBatch locale="en" />);
    await held.settle();

    expect(resumeLinkOf(held), "nothing is offered before the answer arrives").toBeNull();
    expect(held.one<HTMLButtonElement>("button").hasAttribute("disabled")).toBe(false);
    // And the start control is fully labelled — not a pending variant — because no request the
    // participant initiated is open.
    expect((held.one<HTMLButtonElement>("button").textContent ?? "").trim()).toBe(
      t("validateStart.begin"),
    );
    // The offer's own markup is absent in every respect, not merely its link: a heading, a count, and a
    // reassurance sentence would each be a thing shown before the server had said anything.
    expect(held.all('[data-recovery="resume"]').length).toBe(0);
    expect(held.container.innerHTML).not.toContain(t("validateStart.resume.title"));
    expect(held.container.innerHTML).not.toContain(t("validateStart.resume.note"));

    const release = h.hold!.resolve;
    h.hold = null;
    await held.settle(() => release({ status: "none" }));
    held.unmount();
  });

  it("says NOTHING about a failed check, because the catalog holds no such string", async () => {
    // The machine-checkable half of D4, and it is stronger than a rendering comparison: if the screen
    // had grown a "we could not check your progress" line, it would have to come from the catalog, and
    // no recovery key in the catalog is a failure message.
    //
    // The key set is taken from the CATALOG — every key beginning `validateStart.resume.` — rather
    // than from a list written here. A list written here would be a second inventory that drifts, and
    // the defect this repository has already recorded is precisely a guard built from a list that no
    // longer matches its subject.
    const RESUME_PREFIX = "validateStart.resume.";
    // Narrowed to `CopyKey[]` rather than left as `string[]`. `Object.keys` widens to `string`, and
    // indexing a catalog with a `string` is the error TypeScript reports as TS7053 — so without the
    // cast this file does not compile. The cast is safe in the way that matters: `CopyKey` is DERIVED
    // from `ENGLISH_COPY`, so every value in the array really is a key of it. What it cannot guarantee
    // is that a key beginning `validateStart.resume.` is a resume string, which is exactly what the
    // prefix is for.
    const allKeys = Object.keys(ENGLISH_COPY) as CopyKey[];
    const resumeKeys = allKeys.filter((key) => key.startsWith(RESUME_PREFIX));

    // Assert the set was READ rather than empty. A guard that silently found nothing passes all of
    // its own checks — the single most repeated lesson in `docs/ROADMAP.md`.
    expect(resumeKeys.length, "no resume keys were read from the catalog").toBe(5);

    // And none of them reads as a fault. Searched over the RESOLVED strings in BOTH catalogs, so a
    // Filipino failure message would be caught even though the English one does not exist.
    const FAILURE_WORDS = /fail|error|unavailable|problem|sorry|could not|not working|offline/i;
    const offenders = resumeKeys.filter(
      (key) => FAILURE_WORDS.test(ENGLISH_COPY[key]) || FAILURE_WORDS.test(FILIPINO_COPY[key]),
    );
    expect(offenders, "a resume string reads as a failure message").toEqual([]);
  });
});

describe("RC-4/RC-6 — the existing control is untouched", () => {
  it("still issues its allocation request while a resume offer is on screen", async () => {
    // `design.md` D3, observed. The offer is present, the button is enabled and unlabelled-by-this-
    // feature, and pressing it still allocates. Both affordances coexist because an unfinished batch's
    // entries stay allocatable — which is the fact the note beside the offer states to the participant.
    expect(resumeLink()).not.toBeNull();

    await view.pressAndSettle(startControl());

    expect(h.allocations).toHaveLength(1);
    expect((h.allocations[0] as Record<string, unknown>)["validatorId"]).toBe("VAL_a81d92c1");
    expect(h.pushes).toEqual([
      `/validate/${encodeURIComponent("VAL_fresh99-2026-10-02T00:00:00.000Z")}`,
    ]);
    // The resume link is still on screen — starting a new batch does not clear the offer, because the
    // offer describes a batch that still exists.
    expect(resumeLink()).not.toBeNull();
  });

  it("is NEVER disabled by anything the recovery lookup does", async () => {
    // Both states, and the point is that they are IDENTICAL: the requirement is not "enabled when
    // there is an offer" but "enabled always", and a test written as the former would pass while the
    // latter were false.
    const states: boolean[] = [startControl().hasAttribute("disabled")];

    h.lookupResult = { status: "none" };
    const withNone = await mountSettled();
    states.push(withNone.one<HTMLButtonElement>("button").hasAttribute("disabled"));
    withNone.unmount();

    h.lookupResult = { status: "failed", reason: "unavailable" };
    const withFailure = await mountSettled();
    states.push(withFailure.one<HTMLButtonElement>("button").hasAttribute("disabled"));
    withFailure.unmount();

    expect(states).toEqual([false, false, false]);
  });

  it("still asks the participant for the Ilocano question when the browser has no identity", async () => {
    // The pre-existing behaviour, asserted so that adding recovery did not quietly narrow the screen.
    // The recovery branch and this one share a component and neither may swallow the other.
    h.storedId = null;
    const mounted = await mountSettled();

    await mounted.pressAndSettle(mounted.one<HTMLButtonElement>("button"));

    expect(h.allocations).toEqual([]);
    expect(mounted.container.innerHTML).toContain(t("validateStart.noIdentity"));
    mounted.unmount();
  });
});

describe("RC-5 — what the offer may reveal", () => {
  it("renders the validator's identifier ONCE, and only inside the href", async () => {
    // `tasks.md` 6.3, and it is stated as a CLOSED count rather than as "no identifier appears",
    // because that absence check is ALREADY false: `defaultBatchId` embeds the validator's own
    // identifier, so the href carries it by construction. The requirement is that it is the only one.
    expect(h.storedId).toBe("VAL_a81d92c1");

    const occurrences = countOccurrences(view.container.innerHTML, "VAL_a81d92c1");
    expect(occurrences, "the identifier appears somewhere other than the href").toBe(1);
    // And it is in the href, rather than in the count or in the copy.
    expect(resumeLink()!.getAttribute("href")).toContain("VAL_a81d92c1");

    // Nothing else. The batch id contributes a timestamp alongside the identifier, and the count above
    // is counting SUBSTRING matches — so a second identifier anywhere in the document would push it
    // past one, and a whole extra identifier-bearing string could not hide.
    //
    // The fragment searched for is the part of the instant that `encodeURIComponent` leaves alone.
    // Searching for the WHOLE instant returns zero and would assert nothing, because the href holds
    // `20%3A14%3A03` — the first draft of this line searched for the full id and reported a green
    // `expected +0 to be 1`, which is a failure that looks like a pass if only the exit code is read.
    expect(countOccurrences(view.container.innerHTML, "2026-09-30T20")).toBe(1);
    // And the encoded href really does contain the encoded instant, so the count above is measuring a
    // rendered value rather than a coincidence.
    expect(resumeLink()!.getAttribute("href")).toContain(
      encodeURIComponent("2026-09-30T20:14:03.117Z"),
    );
  });

  it("reveals no proficiency, no screening answer, and no activity timestamp", async () => {
    // `tasks.md` 6.2. Every approved proficiency VALUE is searched for, and every catalog KEY whose
    // name suggests profiling, rather than a single word — an absence test against one marker is the
    // defect `docs/ROADMAP.md` records at length, where a five-marker set matched nothing at all of the
    // real data while colliding with legitimate Filipino copy.
    const html = view.container.innerHTML;

    for (const proficiency of [
      "native",
      "fluent",
      "conversational",
      "basic",
      "not_confident",
      "Native",
      "Fluent",
      "Conversational",
      "Basic",
      "Not confident",
    ]) {
      expect(html, `proficiency "${proficiency}" appears on the start screen`).not.toContain(
        proficiency,
      );
    }
    for (const forbidden of [
      "last_active_at",
      "lastActiveAt",
      "createdAt",
      "totalValidations",
      "total_validations",
      "screening",
    ]) {
      expect(html, `"${forbidden}" appears on the start screen`).not.toContain(forbidden);
    }
    // CAN FIRE: the guard above must be able to fail. A real instruction from the dataset pasted into
    // the offer would trip it, and using the REAL record rather than a sample is the lesson
    // `docs/ROADMAP.md` records — a control drawn from a fixture tests the fixture.
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { parseSyntheticDataset } = await import("@/lib/dataset/synthetic-source");
    const { entries } = parseSyntheticDataset(
      JSON.parse(readFileSync(join(process.cwd(), "data", "ilocano-synthetic-data.json"), "utf8")),
    );
    expect(entries.length, "this control read a real dataset").toBe(600);
    expect(html).not.toContain(entries[0].instruction);
  });

  it("shows the batch's own counts and nothing about any OTHER batch", async () => {
    // A batch id for a different batch must not appear, because "you have another batch waiting" would
    // be a fact about a batch this participant has not opened. Asserted as a named absence over an
    // enumeration of ids, all derived from the one under offer by mutation — a hand-written list would
    // be a second inventory that drifts.
    const html = view.container.innerHTML;
    const others = [
      REAL_BATCH.replace("20:14:03", "21:15:04"),
      REAL_BATCH.replace("VAL_a81d92c1", "VAL_deadbeef"),
      `VAL_a81d92c1-2026-09-30T20:14:04.117Z`,
    ];
    expect(
      others.every((id) => id !== REAL_BATCH),
      "the enumeration contains the offered id",
    ).toBe(true);
    for (const other of others) {
      expect(html, `a second batch id appears: ${other}`).not.toContain(other);
    }
  });
});

/** The resume link inside an arbitrary mount, so a test can compare two screens without leaking one. */
function resumeLinkOf(mounted: Mounted): HTMLAnchorElement | null {
  const found = mounted.all('a[href^="/validate/"]');
  return found.length === 0 ? null : (found[0] as HTMLAnchorElement);
}

/** How many times `needle` occurs. Non-overlapping, like the occurrence counts elsewhere. */
function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) throw new Error("countOccurrences requires a non-empty needle");
  let count = 0;
  let at = haystack.indexOf(needle);
  while (at >= 0) {
    count += 1;
    at = haystack.indexOf(needle, at + needle.length);
  }
  return count;
}
