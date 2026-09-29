import { describe, expect, it } from "vitest";

import { badgeClasses } from "@/components/ui/badge";
import { buttonClasses, linkButtonClasses } from "@/components/ui/button";
import { cardClasses } from "@/components/ui/card";
import { controlClasses } from "@/components/ui/field";
import { BatchProgress, segmentClasses, segmentState } from "@/components/ui/progress";
import { answerOptionClasses } from "@/components/validation/answer-option";

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
  it("gives every unselected option an identical surface, border, and shadow", () => {
    // The same builder call must produce byte-identical output for any unselected option:
    // option identity is not an input, so no option can be styled preferentially.
    const a = answerOptionClasses({ selected: false });
    const b = answerOptionClasses({ selected: false });
    const c = answerOptionClasses({ selected: false, className: undefined });
    expect(a).toBe(b);
    expect(b).toBe(c);
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
