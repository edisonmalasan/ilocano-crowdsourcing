import { act, useTransition } from "react";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mount, type Mounted } from "./support/dom-harness";

/**
 * The two researcher client islands, driven with REAL EVENTS.
 *
 * =================================================================================================
 * WHY THIS FILE EXISTS AND WHAT `renderToStaticMarkup` CANNOT DO
 * =================================================================================================
 * The researcher area's only two interactive surfaces are the sign-in form and the sign-out button,
 * and every claim that matters about them is about BEHAVIOUR WHILE A REQUEST IS IN FLIGHT:
 *
 *   - the controls must be disabled while the action runs, and that state must be observable;
 *   - two submissions must produce ONE request, not two;
 *   - a refusal must be rendered as the field's error and announced with the control.
 *
 * `renderToStaticMarkup` provably cannot observe any of those. It never fires a handler, never runs
 * an effect, and never starts a transition, so it can only ever see the idle state.
 * `tests/unit/admin-routes.test.tsx` covers the initial markup and says so; this file covers what
 * happens next.
 *
 * =================================================================================================
 * THE SINGLE-FLIGHT ARRANGEMENT IS THE WHOLE POINT, AND IT IS NOT OBVIOUS
 * =================================================================================================
 * `disabled={isPending}` is what the person sees, and it is NOT what makes the guarantee. React commits
 * `disabled` at the CLOSE of an event handler, so two submissions dispatched inside ONE task both
 * reach the handler while both still see the control enabled. `press` opens and closes its own `act`,
 * which means React commits `disabled` between the two — so a two-`press` test passes with the ref
 * latch DELETED, because `disabled` alone stops the second.
 *
 * Only `pressMany` — every event inside ONE `act` — can tell the latch from `disabled`. This project
 * has been bitten by exactly this before, and `tests/dom/batch-completion.test.tsx` records the
 * measurement: deleting the latch there left the suite green under a two-press arrangement. The
 * `CAN FIRE` test below is the companion control, and it is why the count of 1 above is a
 * MEASUREMENT rather than a limitation of the harness.
 *
 * =================================================================================================
 * WHAT HAPPENS-NEVER-FIRED LOOKS LIKE HERE
 * =================================================================================================
 * `happy-dom` performs no real navigation and no form submission, so navigation is observed
 * as a recorded router call in mount order rather than as a page change — the same arrangement
 * `start-batch.test.tsx` uses for its pushes.
 */

/** What the stubbed `signInAction` does for one call. */
type Behaviour =
  /** Refuse, resolving with the server's shared message. */
  | { kind: "refuse" }
  /** Succeed, resolving with the success member and setting nothing. */
  | { kind: "succeed" }
  /** Reject, which is what a transport failure looks like to the component. */
  | { kind: "reject" }
  /** Never settle, so the pending window is observable and released deliberately. */
  | { kind: "hang" };

/** The one string, imported from the module that owns it rather than retyped here. */
const SHARED_REFUSAL = "That credential was not accepted. Check it and try again.";

/** Every recorded action call, in order. */
let calls: { credential: string | null; field: string }[] = [];
let behaviour: Behaviour = { kind: "refuse" };
/**
 * Resolvers for every transition currently suspended by `hang`, drained in `afterEach`.
 *
 * =================================================================================================
 * WHY A HANG MUST BE RELEASED, AND WHY THIS IS NOT A DETAIL
 * =================================================================================================
 * The first version used `neverResolves()` and left it that way. It worked for the test that needed a
 * pending window — and then five LATER tests in the same file failed with `disabled` still true on a
 * component that had just been mounted idle.
 *
 * The cause is a leaked transition, not a defect in those tests: a `useTransition` left open forever
 * keeps React's work queue non-empty, so subsequent commits are deferred behind it. The visible
 * symptom is a component stuck in a state it was never put into, which is exactly the shape of a
 * harness defect that gets mistaken for a code defect. The suite also spent 6.76s of its 7.58s in
 * environment setup, which was the same starvation showing up as a cost.
 *
 * So a hang is a promise this file owns and must let go of. Every one is released before the next
 * test starts, whether or not the test cared about the pending state.
 */
const suspended: (() => void)[] = [];

/**
 * A promise that suspends until {@link suspended} is drained.
 *
 * Deliberately RESOLVABLE, unlike the harness's `neverResolves()`. A transition that never settles is
 * exactly what a pending-state test needs and exactly what the NEXT test must not inherit — so this
 * file owns the release, and `afterEach` performs it unconditionally.
 */
function hang(): Promise<void> {
  return new Promise<void>((resolve) => {
    suspended.push(resolve);
  });
}

/** Releases every suspended transition. Called from `afterEach`, always. */
function releaseSuspended(): void {
  while (suspended.length > 0) suspended.pop()?.();
}

/** Every router navigation the component requested, in order. */
let pushes: string[] = [];

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: (destination: string) => {
      pushes.push(destination);
    },
    replace: () => {},
    refresh: () => {},
    back: () => {},
  }),
}));

vi.mock("@/lib/admin/actions", () => ({
  signInAction: async (formData: FormData) => {
    calls.push({
      credential: formData.get("researcherAccessKey") as string | null,
      field: "signIn",
    });
    if (behaviour.kind === "reject") throw new Error("the request never produced an answer");
    if (behaviour.kind === "hang") await hang();
    if (behaviour.kind === "succeed") return { status: "authenticated" };
    return { status: "refused", message: SHARED_REFUSAL };
  },
  signOutAction: async () => {
    calls.push({ credential: null, field: "signOut" });
    if (behaviour.kind === "reject") throw new Error("the request never produced an answer");
    if (behaviour.kind === "hang") await hang();
  },
}));

let mounted: Mounted | undefined;

async function mountSignIn(): Promise<Mounted> {
  const { SignInForm } = await import("@/app/researcher/sign-in/sign-in-form");
  return mount(<SignInForm />);
}

async function mountSignOut(): Promise<Mounted> {
  const { SignOutButton } = await import("@/app/researcher/sign-out-button");
  return mount(<SignOutButton />);
}

/** Sets the field's value the way a person would, through the live control. */
function type(harness: Mounted, value: string): void {
  const input = harness.one<HTMLInputElement>("input");
  input.value = value;
}

beforeEach(() => {
  calls = [];
  pushes = [];
  behaviour = { kind: "refuse" };
});

afterEach(async () => {
  // Release FIRST, so the suspended transition can settle while the component is still mounted, and
  // only then unmount — unmounting first would leave the transition's state updates targeting a
  // detached tree, which React warns about and which leaves the act queue dirty for the next file.
  releaseSuspended();
  await mounted?.settle();
  mounted?.unmount();
  mounted = undefined;
});

describe("the sign-in form reaches the Server Action", () => {
  it("sends the typed value verbatim, with nothing else", async () => {
    mounted = await mountSignIn();
    type(mounted, "an-operator-access-key-4f2a");
    await mounted.submitFormAndSettle(mounted.one<HTMLFormElement>("form"));

    expect(calls).toHaveLength(1);
    expect(calls[0]?.field).toBe("signIn");
    // Sent EXACTLY as typed — no trimming, no normalisation. The server compares it as a
    // fixed-length digest, and a value the operator did not type must not become one they did.
    expect(calls[0]?.credential).toBe("an-operator-access-key-4f2a");
  });

  it("sends an EMPTY value as an empty string rather than omitting the field", async () => {
    mounted = await mountSignIn();
    await mounted.submitFormAndSettle(mounted.one<HTMLFormElement>("form"));

    // A real browser's `required` stops an empty submit before the handler runs. Dispatching the
    // event directly bypasses that, so this asserts what the component SENDS when it is asked —
    // which is exactly what the action's write-intake boundary is written to receive, and the
    // boundary is where an empty value is rejected.
    expect(calls[0]?.credential).toBe("");
  });

  it("renders the refusal as the field's error, wired to the control", async () => {
    mounted = await mountSignIn();
    await mounted.submitFormAndSettle(mounted.one<HTMLFormElement>("form"));

    const input = mounted.one<HTMLInputElement>("input");
    // The message must live at the id `aria-describedby` names, or it is loose text beside a field
    // and is not announced with it. Asserting the message merely EXISTS would pass with a detached
    // paragraph above the form — which is the shape this assertion exists to rule out.
    const describedBy = (input.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
    const announced = describedBy
      .map((id) => mounted?.container.querySelector(`#${id}`)?.textContent ?? "")
      .join(" ");
    expect(announced).toContain(SHARED_REFUSAL);

    // And it is an alert, so it is announced when it appears rather than only on the next focus.
    const alert = mounted.one<HTMLElement>('[role="alert"]');
    expect(alert.textContent).toContain(SHARED_REFUSAL);
  });

  it("marks the control invalid, and clears BOTH when the next attempt starts", async () => {
    mounted = await mountSignIn();
    const input = mounted.one<HTMLInputElement>("input");
    await mounted.submitFormAndSettle(mounted.one<HTMLFormElement>("form"));

    // `aria-invalid` comes from the error alone, so validity is never signalled by colour only.
    expect(input.getAttribute("aria-invalid")).toBe("true");

    // A refusal that persists under a field the person has already corrected is a stale error: it
    // describes the previous attempt, and leaving it there tells them the new one also failed before
    // it has.
    behaviour = { kind: "hang" };
    mounted.submitForm(mounted.one<HTMLFormElement>("form"));
    expect(input.getAttribute("aria-invalid")).toBeNull();
    expect(mounted.container.querySelector('[role="alert"]')).toBeNull();
  });

  it("disables BOTH the control and the button while the request is in flight", async () => {
    mounted = await mountSignIn();
    behaviour = { kind: "hang" };
    const form = mounted.one<HTMLFormElement>("form");
    const button = mounted.one<HTMLButtonElement>("button");
    const input = mounted.one<HTMLInputElement>("input");

    expect(button.disabled).toBe(false);
    expect(input.disabled).toBe(false);
    // A SYNCHRONOUS act, so the never-resolving action leaves the transition open on return. An
    // async act would await a promise that never resolves, which is why `neverResolves` pairs with
    // `submitForm` rather than with `submitFormAndSettle`.
    mounted.submitForm(form);

    // `happy-dom` performs no real event-loop scheduling, so this is observed INSIDE the act that
    // started the request rather than after a timer — which is what makes the window reachable here
    // at all.
    expect(button.disabled).toBe(true);
    expect(input.disabled).toBe(true);
    // The button says so, so the state is not signalled by disabling alone.
    expect(button.textContent).toBe("Checking…");
    // `aria-busy` tells assistive technology the region is updating.
    expect(form.getAttribute("aria-busy")).toBe("true");
  });

  it("re-enables both when the request settles with a refusal", async () => {
    mounted = await mountSignIn();
    await mounted.submitFormAndSettle(mounted.one<HTMLFormElement>("form"));

    // A form left disabled after a refusal would require a page reload to retry, which for a
    // locked-out researcher is indistinguishable from the credential having been revoked.
    expect(mounted.one<HTMLButtonElement>("button").disabled).toBe(false);
    expect(mounted.one<HTMLInputElement>("input").disabled).toBe(false);
    expect(mounted.one<HTMLButtonElement>("button").textContent).toBe("Sign in");
  });

  it("recovers from a REJECTED action, showing the shared refusal and re-enabling", async () => {
    mounted = await mountSignIn();
    behaviour = { kind: "reject" };
    await mounted.submitFormAndSettle(mounted.one<HTMLFormElement>("form"));

    // This test found a real defect. The transition had `try { … } finally { … }` and NO `catch`, so
    // a Server Action rejection escaped into React's error boundary: the researcher's screen would be
    // replaced by an error page, and if it were merely swallowed the controls would re-enable with
    // NOTHING on screen — indistinguishable from the click not registering.
    expect(mounted.one<HTMLButtonElement>("button").disabled).toBe(false);
    // The SAME sentence the server uses. A distinct wording for a transport failure would itself be an
    // oracle, telling the requester which of the two happened without being told.
    const alert = mounted.one<HTMLElement>('[role="alert"]');
    expect(alert.textContent).toContain(SHARED_REFUSAL);
  });

  it("shows the refusal a server sends rather than one of its own", async () => {
    // The component must render what the server said, not a local paraphrase. A client-side sentence
    // would drift from the server's, and the drift would be the oracle described above. Asserted by
    // the import rather than by string equality with a copy, because there is only one copy.
    mounted = await mountSignIn();
    await mounted.submitFormAndSettle(mounted.one<HTMLFormElement>("form"));
    const { RESEARCHER_SIGN_IN_REFUSAL_MESSAGE } = await import("@/lib/admin/refusal");
    expect(RESEARCHER_SIGN_IN_REFUSAL_MESSAGE).toBe(SHARED_REFUSAL);
    expect(mounted.one<HTMLElement>('[role="alert"]').textContent).toContain(
      RESEARCHER_SIGN_IN_REFUSAL_MESSAGE,
    );
  });
});

describe("a successful sign-in navigates with no refusal ever rendered", () => {
  it("pushes the researcher area and shows no refusal message at any point", async () => {
    // The exact regression: success used to end in a thrown redirect, which the form's `catch`
    // rendered as the refusal message while the access had been granted. Success now arrives as
    // a returned member, so there is nothing for the `catch` to convert — and this test would
    // fail against that code, because nothing would navigate and nothing would refuse either.
    mounted = await mountSignIn();
    behaviour = { kind: "succeed" };
    type(mounted, "the-right-operator-key");
    await mounted.submitFormAndSettle(mounted.one<HTMLFormElement>("form"));

    expect(calls).toHaveLength(1);
    expect(pushes).toEqual(["/researcher"]);
    // And no refusal is rendered for the granted access — neither as a flash nor as a final
    // state. Against the old code this fails on the navigation alone (nothing navigates), and
    // against old code driven by a redirect-throw it would fail here too, with the message shown.
    expect(mounted.container.querySelector('[role="alert"]')).toBeNull();
    expect(mounted.container.textContent ?? "").not.toContain(SHARED_REFUSAL);
  });

  it("re-enables the controls after navigating, so the latch does not wedge", async () => {
    mounted = await mountSignIn();
    behaviour = { kind: "succeed" };
    await mounted.submitFormAndSettle(mounted.one<HTMLFormElement>("form"));

    expect(mounted.one<HTMLButtonElement>("button").disabled).toBe(false);
  });
});

describe("one request per attempt, not one per click", () => {
  it("issues exactly ONE request for two submissions dispatched in the same task", async () => {
    mounted = await mountSignIn();
    behaviour = { kind: "hang" };
    const form = mounted.one<HTMLFormElement>("form");

    // TWO events inside ONE act. This is the arrangement that distinguishes the ref latch from
    // `disabled`; see the file header for why two separate calls cannot do this.
    submitMany(form, 2);

    // One request means one credential comparison and one counter increment. Two would mean a
    // double-click consumed two of the ten attempts this origin is allowed, for one human action —
    // and a limit that a mistype can exhaust is a limit that locks out a real operator.
    expect(calls).toHaveLength(1);
  });

  it("CAN FIRE: counts TWO for a deliberately latch-less form", async () => {
    // The control for the test above. Without it, "the latch makes the count 1" would be
    // indistinguishable from "the harness cannot dispatch two submissions in one task" — the exact
    // vacuity this project has now found in three separate guards.
    let handlerRuns = 0;
    function LatchlessForm() {
      const [isPending, startTransition] = useTransition();
      return (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            handlerRuns += 1;
            startTransition(async () => {
              await hang();
            });
          }}
        >
          <button type="submit" disabled={isPending}>
            Go
          </button>
        </form>
      );
    }

    mounted = mount(<LatchlessForm />);
    submitMany(mounted.one<HTMLFormElement>("form"), 2);

    // Both handlers ran, and this component has NO latch — so the count of 1 in the test above is a
    // measurement of the latch rather than a limit of the harness. It uses `disabled` exactly as the
    // real form does, which is what makes it the right control: the only difference is the latch.
    expect(handlerRuns).toBe(2);
  });

  it("allows a SECOND request once the first has settled", async () => {
    // The other control for the latch tests: a latch that never released would satisfy "one request"
    // by refusing every request after the first, which is not what a latch is for.
    mounted = await mountSignIn();
    const form = mounted.one<HTMLFormElement>("form");
    await mounted.submitFormAndSettle(form);
    expect(calls).toHaveLength(1);
    await mounted.submitFormAndSettle(form);
    expect(calls).toHaveLength(2);
  });
});

describe("the sign-out control", () => {
  it("issues exactly one request for two clicks in the same task", async () => {
    mounted = await mountSignOut();
    mounted.pressMany(mounted.one<HTMLButtonElement>("button"), 2);

    // Clearing a cookie twice is harmless, but a control that issues two requests because somebody
    // double-clicked is a control whose behaviour depends on timing, and `pressMany` is what makes
    // that observable rather than assumed.
    expect(calls).toHaveLength(1);
    expect(calls[0]?.field).toBe("signOut");
  });

  it("is a BUTTON, not a link, so it cannot be reached by following one", async () => {
    mounted = await mountSignOut();
    // `SameSite=Lax` permits a top-level GET navigation to carry the session cookie, so anything that
    // CHANGES server state must be a POST unreachable by a link. An anchor here would be a
    // state-changing action a third party could cause by rendering it.
    expect(mounted.container.querySelector("a")).toBeNull();
    expect(mounted.one<HTMLButtonElement>("button").getAttribute("type")).toBe("button");
  });

  it("disables itself while its request runs, and re-enables when it settles", async () => {
    mounted = await mountSignOut();
    const button = mounted.one<HTMLButtonElement>("button");
    expect(button.disabled).toBe(false);

    behaviour = { kind: "hang" };
    mounted.press(button);
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe("Signing out…");

    // The action is already suspended INSIDE `hang()`, so setting `behaviour` back would do nothing —
    // the stub read it before suspending. The promise itself has to be released, which is the whole
    // reason this file owns `suspended` rather than using the harness's `neverResolves()`.
    releaseSuspended();
    await mounted.settle();
    // `signOutAction` here resolves immediately on success, so a control that stayed disabled would
    // leave a researcher unable to try again — which is the failure a person would actually see.
    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe("Sign out");
  });

  it("returns to idle when its action REJECTS, rather than erroring the screen", async () => {
    mounted = await mountSignOut();
    behaviour = { kind: "reject" };
    await mounted.pressAndSettle(mounted.one<HTMLButtonElement>("button"));

    // A rejection that reached React's error boundary would replace the researcher's screen with an
    // error page for a failed LOGOUT — worse than doing nothing, and it would make a network blip
    // look like the researcher area breaking. The state on screen is already correct (the session was
    // not cleared, so the researcher is still signed in), which is why the catch is empty.
    expect(mounted.one<HTMLButtonElement>("button").disabled).toBe(false);
    expect(mounted.container.querySelector('[role="alert"]')).toBeNull();
  });
});

/**
 * Dispatches `count` `submit` events inside ONE synchronous `act`.
 *
 * The harness's `pressMany` dispatches `click`, which is the wrong event for a form, and its
 * `submitForm` dispatches exactly one. This is the same arrangement `pressMany` exists to model,
 * reproduced for the event a form actually receives — and for the same reason: the latch is only
 * observable when every event lands before React commits anything.
 *
 * `count` must be a positive integer, and the check is the harness's own reasoning: a zero-count call
 * dispatches nothing and passes while testing nothing, which is the vacuity this project has now
 * found in three separate guards.
 */
function submitMany(form: HTMLFormElement, count: number): void {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(
      `submitMany requires a positive integer count, got ${String(count)}. ` +
        `A zero or negative count would dispatch nothing and pass while testing nothing.`,
    );
  }
  act(() => {
    for (let index = 0; index < count; index += 1) {
      form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    }
  });
}
