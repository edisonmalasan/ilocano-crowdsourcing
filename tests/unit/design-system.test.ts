import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { badgeClasses } from "@/components/ui/badge";
import { buttonClasses, linkButtonClasses } from "@/components/ui/button";
import { cardClasses } from "@/components/ui/card";
import { controlClasses } from "@/components/ui/field";
import { BatchProgress, segmentClasses, segmentState } from "@/components/ui/progress";
import { answerOptionClasses } from "@/components/validation/answer-option";
import { localeChoiceClasses } from "@/components/i18n/locale-switcher";

/**
 * Token-contract tests.
 *
 * These assert the property the `design-system` spec actually cares about: that every visual
 * value resolves to a design-system token, and — for answer options — that no unselected option
 * can reach an accent token. They are pure-class assertions rather than pixel tests, because the
 * contract is "these tokens, no literals", which is checkable without a browser.
 */

/**
 * A raw colour literal, or an arbitrary-value bracket that would smuggle a raw shadow or radius
 * past the token set. Tailwind *scale* utilities (`h-2.5`, `px-4`, `gap-3`, `text-sm`) are
 * token-derived and are deliberately not matched — they are not raw literals.
 */
const RAW_LITERAL = /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(|\b(?:shadow|rounded)-\[/;

/** The accent tokens that must never reach an unselected answer option. */
const ACCENT_TOKENS = [
  "bg-accent",
  "bg-accent-tint",
  "bg-accent-hover",
  "bg-accent-press",
  "text-accent",
  "border-accent",
];

describe("token discipline", () => {
  const builders: Array<[string, () => string]> = [
    ["button primary", () => buttonClasses({ variant: "primary" })],
    ["button secondary", () => buttonClasses({ variant: "secondary" })],
    ["button quiet", () => buttonClasses({ variant: "quiet" })],
    ["button danger", () => buttonClasses({ variant: "danger" })],
    ["link button", () => linkButtonClasses()],
    ["card raised", () => cardClasses()],
    ["card inset", () => cardClasses({ tone: "inset" })],
    ["card accent", () => cardClasses({ tone: "accent" })],
    ["badge neutral", () => badgeClasses()],
    ["badge alert", () => badgeClasses({ tone: "alert" })],
    ["control", () => controlClasses()],
    ["control invalid", () => controlClasses({ invalid: true })],
    ["answer selected", () => answerOptionClasses({ selected: true })],
    ["answer unselected", () => answerOptionClasses({ selected: false })],
    ["segment complete", () => segmentClasses("complete")],
    // Added by the interface-localization change. Both states, because the ACTIVE state is the one
    // that differs and an addition covering only the default would not have exercised it - the same
    // reason `answer selected` and `answer unselected` are both listed.
    ["locale choice active", () => localeChoiceClasses(true)],
    ["locale choice inactive", () => localeChoiceClasses(false)],
  ];

  it.each(builders)("%s uses tokens and no raw literals", (_label, build) => {
    const classes = build();
    expect(classes.length).toBeGreaterThan(0);
    expect(classes, `raw literal in: ${classes}`).not.toMatch(RAW_LITERAL);
  });

  it("uses a 2px border token on every interactive surface", () => {
    expect(buttonClasses()).toContain("border-2");
    expect(cardClasses()).toContain("border-2");
    expect(answerOptionClasses({ selected: false })).toContain("border-2");
    // The language controls are the one interactive surface added since, and the neo-brutalist
    // direction is a hard border on every tactile control - a switcher that opted out would look
    // like a different product from the button beside it.
    expect(localeChoiceClasses(false)).toContain("border-2");
  });

  it("uses zero-blur hard offset shadows rather than diffuse glows", () => {
    // The token names carry the blur explicitly: a soft shadow would be `shadow-sm`-style
    // utility, which resolves to a blur radius. None of these may appear.
    const classes = [buttonClasses(), cardClasses(), answerOptionClasses({ selected: true })];
    for (const value of classes) {
      expect(value).not.toMatch(/\bshadow-(sm|md|lg|xl|2xl)\b/);
      expect(value).toMatch(/shadow-brutal-/);
    }
  });

  it("softens corners instead of squaring them, rejecting the brutalist 0px rule", () => {
    expect(cardClasses()).toContain("rounded-card");
    expect(buttonClasses()).not.toContain("rounded-none");
  });
});

describe("answer option neutrality (research integrity)", () => {
  it("takes no per-option input, so no option can be styled preferentially", () => {
    // This assertion previously compared `answerOptionClasses({ selected: false })` to
    // itself, under a heading about research integrity. Independent review found the same
    // anti-pattern retracted elsewhere in this change for exactly this reason: one
    // function, one argument, against its own result. It cannot detect a bypassed
    // component, a per-option `className`, or an accent added to one screen - and in the
    // reviewer's bypass probe this file stayed green.
    //
    // What is genuinely claimed here is about the function's OUTPUT for the unselected
    // state. An earlier version of this comment claimed something stronger and false: that
    // adding a per-option `className` parameter would make this file "fail to COMPILE".
    // Review added `emphasis?: boolean` to the options type and typecheck exited 0 - because
    // `className?: string` ALREADY EXISTS on that type. The component's own header is the
    // accurate version of this: the escape hatch is deliberate, and "the constraint is
    // enforced by `AnswerGroup`'s call site and by test, not by the type system". Nothing
    // here defends the type system; it defends the rendered output.
    //
    // The screen-level half is asserted on rendered markup in
    // `onboarding-routes.test.tsx`, where the rendered `class` of every `role="radio"` is
    // compared against this function's output. That is the assertion that goes red when a
    // component is bypassed; this one checks the constant that comparison targets, and would
    // not notice a bypass on its own.
    const unselected: string = answerOptionClasses({ selected: false });
    const selected: string = answerOptionClasses({ selected: true });

    // Two states, genuinely different inputs, and the unselected one carries no accent.
    expect(unselected).not.toBe(selected);
    for (const token of ACCENT_TOKENS) {
      expect(unselected, `unselected option reached ${token}`).not.toContain(token);
    }
  });

  it("keeps the accent unreachable from an unselected option", () => {
    const unselected = answerOptionClasses({ selected: false });
    for (const token of ACCENT_TOKENS) {
      expect(unselected, `unselected option reached ${token}`).not.toContain(token);
    }
    // It must use the dedicated neutral answer tokens instead.
    expect(unselected).toContain("bg-answer-surface");
    expect(unselected).toContain("border-answer-border");
  });

  it("applies the selected treatment only when selected", () => {
    const selected = answerOptionClasses({ selected: true });
    expect(selected).toContain("bg-answer-selected-surface");
    expect(selected).toContain("text-answer-selected-text");
  });

  it("produces different output for selected vs unselected", () => {
    expect(answerOptionClasses({ selected: true })).not.toBe(
      answerOptionClasses({ selected: false }),
    );
  });
});

describe("progress is not communicated by colour alone", () => {
  it("distinguishes segment states by fill, not only by colour", () => {
    const complete = segmentClasses("complete");
    const current = segmentClasses("current");
    const pending = segmentClasses("pending");

    // "complete" is an ink fill; "pending" is transparent (an outline). That is a shape
    // difference that survives greyscale and colour-blindness.
    expect(complete).toContain("bg-ink");
    expect(pending).toContain("bg-transparent");
    expect(complete).not.toBe(pending);
    expect(current).not.toBe(pending);
  });

  it("classifies each segment position around the current item", () => {
    expect(segmentState(1, 3)).toBe("complete");
    expect(segmentState(2, 3)).toBe("complete");
    expect(segmentState(3, 3)).toBe("current");
    expect(segmentState(4, 3)).toBe("pending");
  });
});

describe("BatchProgress", () => {
  it("renders without crashing and clamps out-of-range positions", () => {
    expect(BatchProgress({ index: 3, total: 10 })).toBeTruthy();
    // A position beyond the batch must not be rendered as-is.
    expect(BatchProgress({ index: 99, total: 10 })).toBeTruthy();
    expect(BatchProgress({ index: 0, total: 0 })).toBeTruthy();
  });
});

/**
 * The token file itself, read from disk.
 *
 * These assertions exist because the class-string tests above cannot see the *values*. A token can
 * be named correctly and referenced correctly and still hold a value that breaks a spec
 * requirement. That is exactly what happened: `--text-small` was 0.9375rem (15px) while the
 * file's own comment claimed a 1rem body floor was "enforced here", and the landing page rendered
 * whole paragraphs in it. Nothing caught it, because every class string resolved to a token that
 * was legitimately named.
 */
const GLOBALS_CSS = readFileSync(
  resolve(import.meta.dirname, "../../src/styles/globals.css"),
  "utf8",
);
const LAYOUT_TSX = readFileSync(resolve(import.meta.dirname, "../../src/app/layout.tsx"), "utf8");

/** Resolves a token to its declared value, or `undefined` when the token is absent. */
function tokenValue(name: string): string | undefined {
  return new RegExp(`^\\s*--${name}:\\s*(.+?);\\s*$`, "m").exec(GLOBALS_CSS)?.[1]?.trim();
}

/** The fixed `rem` value a token declares, or `null` for `clamp()` roles which have no fixed size. */
function fixedRemValue(value: string | undefined): number | null {
  if (value === undefined || value.startsWith("clamp(")) return null;
  const match = /^([\d.]+)rem$/.exec(value);
  return match ? Number(match[1]) : null;
}

/** The smallest size a role can render at, for both fixed and `clamp()` declarations. */
function smallestRenderedRem(value: string | undefined): number | null {
  const fixed = fixedRemValue(value);
  if (fixed !== null) return fixed;
  const clampLowerBound = /clamp\(\s*([\d.]+)rem/.exec(value ?? "")?.[1];
  return clampLowerBound === undefined ? null : Number(clampLowerBound);
}

describe("body text size floor", () => {
  // The `design-system` spec requires text to stay at or above the minimum readable body size the
  // token set defines. Every role that renders PROSE is bound by that floor. `--text-label` is the
  // single documented exception: monospace micro-label metadata, not reading copy.
  const PROSE_ROLES = ["display", "title", "heading", "lead", "body", "small"] as const;
  const MINIMUM_BODY_REM = 1;

  it("declares the floor on the body role", () => {
    expect(fixedRemValue(tokenValue("text-body"))).toBe(MINIMUM_BODY_REM);
  });

  it.each(PROSE_ROLES)("keeps the %s prose role at or above the floor", (role) => {
    const declared = tokenValue(`text-${role}`);
    expect(declared, `--text-${role} is not declared in the @theme block`).toBeDefined();

    const smallest = smallestRenderedRem(declared);
    expect(smallest, `could not read a size out of --text-${role}: ${declared}`).not.toBeNull();
    expect(
      smallest,
      `--text-${role} is ${declared}, below the ${MINIMUM_BODY_REM}rem body floor`,
    ).toBeGreaterThanOrEqual(MINIMUM_BODY_REM);
  });

  it("permits exactly one sub-floor role, and it is the metadata label", () => {
    // The label role is allowed under the floor, and it must stay there rather than drifting up
    // into a prose size, so that its role as metadata remains visible in the token set itself.
    expect(smallestRenderedRem(tokenValue("text-label"))).toBeLessThan(MINIMUM_BODY_REM);
  });
});

describe("the paper token has no second copy", () => {
  it("keeps the viewport themeColor equal to the paper token", () => {
    // Next.js requires `viewport.themeColor` to be a literal string, so it cannot be a token
    // reference. That makes it a silent duplicate of `--color-paper`: changing the paper token
    // would leave browser chrome on the old colour and nothing would report the drift.
    const paper = tokenValue("color-paper");
    expect(paper, "--color-paper is not declared in the @theme block").toBeDefined();

    const themeColor = /themeColor:\s*"([^"]+)"/.exec(LAYOUT_TSX)?.[1];
    expect(themeColor, "layout.tsx does not declare a literal themeColor").toBeDefined();
    expect(themeColor, "viewport themeColor has drifted from --color-paper").toBe(paper);
  });
});
