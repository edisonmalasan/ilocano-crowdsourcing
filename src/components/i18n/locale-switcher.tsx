import { cn } from "@/lib/styles/cn";
import { LOCALE_NAME_KEYS, translatorFor } from "@/lib/i18n/copy";
import { INTERFACE_LOCALES, type InterfaceLocale } from "@/lib/domain/locale";

/**
 * The `ENG | FIL` interface language switcher.
 *
 * ============================================================================
 * WHAT IT IS, AND THE TWO WAYS IT COULD HAVE BEEN BUILT
 * ============================================================================
 * This is a Server Component rendering a plain `<form>` whose action is a Server Action. That is
 * deliberate, and it is the reason it needs no `"use client"` directive and no state.
 *
 * The obvious alternative is a client island with two buttons and `onClick`, a `useTransition`,
 * and an optimistic swap of the visible labels. It was rejected because it makes the language of
 * the page depend on JavaScript having run: with the server rendering the state and a form
 * submitting it, the switcher works on the first paint, works with a slow connection, and works
 * with scripting unavailable. For a research instrument a participant may be using on a phone with
 * a poor signal, "the control that changes the language" being the one part that needs hydration
 * would be a poor trade for a pending state that nothing waits on.
 *
 * The cost of the form is one full request per switch in the worst case and no pending feedback.
 * That is the right cost for a preference nobody waits on, and `useOptimistic` was rejected rather
 * than used because a temporarily WRONG language label is worse than an unchanged one.
 *
 * ============================================================================
 * WHY THE ACTION IS A PROP RATHER THAN AN IMPORT
 * ============================================================================
 * `actions.ts` is a `"use server"` module, and this file lives under `src/components/`, which the
 * `sadino/no-privileged-imports` rule treats as browser-side. Importing the action here would put a
 * server-only module in a module the boundary rule considers client code, and the rule is right to:
 * the ESLint rule is a heuristic about directories, and this component is genuinely a Server
 * Component only because its parent is one. Taking the action as a prop makes that explicit and
 * keeps this file importable from anywhere, with the wiring visible at the one call site in the
 * root layout.
 *
 * ============================================================================
 * SUBORDINATE ON PURPOSE: THE SPEC SAYS WHY IN BOTH DIRECTIONS
 * ============================================================================
 * "The switcher is reachable from every public page" and "it is not the dominant element of the
 * page". Both matter and they pull against each other, so the decisions are explicit:
 *
 *   - Reachable: it is rendered by the ROOT LAYOUT, not by each page. That makes presence a
 *     structural property - a route that forgot it cannot exist - and it is the only way the
 *     not-found page gets one, since that page deliberately has no header of its own. The layout's
 *     bar also sits ABOVE every page's own header, so a participant who has been on three pages
 *     has seen it three times in the same place.
 *   - Subordinate: no accent surface, no elevation, no title, and the smallest type role in the
 *     token set. The accent is reserved for the primary action on the page, and a language switch
 *     that looked like the main call to action would be a switcher competing with the validation
 *     task. The `min-h-11` (44px) touch target is the ONE place size is not reduced, because
 *     "subordinate" must not mean "hard to hit on a phone".
 *
 * ============================================================================
 * WHY THE ACTIVE LOCALE IS NOT SHOWN BY COLOUR ALONE
 * ============================================================================
 * Two independent signals, and the design system's own progress component is the precedent for
 * insisting on the second: `aria-current="true"` for assistive technology, and a visible check mark
 * for everyone else. The active button is also filled ink, so the state is legible in greyscale and
 * to a colour-blind participant. No locale is indicated by hue anywhere in this component.
 *
 * The check mark is held in a fixed-width slot so the control does not shift sideways when the
 * locale changes.
 *
 * ============================================================================
 * WHY `ENG` AND `FIL` ARE LITERALS AND NOT CATALOG KEYS
 * ============================================================================
 * They are the standard abbreviations of the two language names and are byte-identical in both
 * languages, so a catalog key for them would be a string that CANNOT differ - a key whose whole
 * purpose is to be exempt from the exhaustiveness check. The accessible name of each control is
 * localized, and that is the part a participant who cannot read the abbreviation needs.
 */

/** The Server Action this form submits to. Injected rather than imported - see the header. */
export type LocaleSwitchAction = (formData: FormData) => void | Promise<void>;

export interface LocaleSwitcherProps {
  /** The locale currently being rendered. Decides which control is marked active. */
  locale: InterfaceLocale;
  /** The Server Action that writes the chosen locale. */
  action: LocaleSwitchAction;
}

/** The abbreviation rendered on a control. Identical in both languages - see the header. */
const ABBREVIATION: Record<InterfaceLocale, string> = {
  en: "ENG",
  fil: "FIL",
};

/**
 * Pure class builder for one language control.
 *
 * Exported so the token contract in `tests/unit/design-system.test.ts` can assert it without
 * rendering, which is what that file already does for every other control. There is no accent token
 * in either state: the accent belongs to the page's primary action, and a switcher drawn in it
 * would be a switcher competing with the task.
 *
 * Focus needs no class of its own. `globals.css` gives every focusable element a 3px ink ring with
 * an offset, and this control deliberately does not sit inside an `overflow-hidden` frame - a frame
 * that clipped the ring would leave a keyboard user with no visible focus at all, which is a worse
 * defect than a square corner.
 */
export function localeChoiceClasses(active: boolean): string {
  return cn(
    "label-meta flex min-h-11 flex-1 items-center justify-center gap-2 border-2 border-ink px-3",
    "font-semibold no-underline",
    "transition-[background-color,color] duration-[--duration-fast] ease-[--ease-brutal]",
    active
      ? "bg-ink text-paper"
      : "bg-paper-raised text-ink-muted hover:bg-paper-sunken hover:text-ink",
  );
}

/** One control. `type="submit"` with the locale in `name`/`value` is what puts it in the payload. */
function LocaleChoice({
  locale,
  active,
  name,
}: {
  locale: InterfaceLocale;
  active: boolean;
  name: string;
}) {
  return (
    <button
      type="submit"
      name="locale"
      value={locale}
      // Not a link and not an anchor: it submits, so it must be a button. It is inside the layout's
      // chrome bar and therefore outside every page's own `<form>`, so it cannot submit a screening
      // answer or a validation response by accident.
      aria-current={active ? "true" : undefined}
      aria-label={name}
      className={localeChoiceClasses(active)}
    >
      <span aria-hidden="true" className="w-3 text-center">
        {active ? "✓" : ""}
      </span>
      <span aria-hidden="true">{ABBREVIATION[locale]}</span>
    </button>
  );
}

/**
 * The language control.
 *
 * The `<form>` carries the accessible name rather than a wrapping `role="group"`: a form is
 * announced by assistive technology as a region with a name, and the two buttons inside it announce
 * their own language names, so the participant hears "Interface language" and then "English" or
 * "Filipino" rather than two unexplained abbreviations.
 *
 * `INTERFACE_LOCALES` is mapped rather than the two locales written out, so the control cannot show
 * one language and omit the other: adding a third approved locale adds a third control here without
 * anyone editing this file, and a control for a language with no catalog strings would fail the
 * type-check in `copy.ts` before it could render.
 */
export function LocaleSwitcher({ locale, action }: LocaleSwitcherProps) {
  const t = translatorFor(locale);

  return (
    <form action={action} aria-label={t("switcher.label")} className="flex items-center gap-2">
      {INTERFACE_LOCALES.map((choice) => (
        <LocaleChoice
          key={choice}
          locale={choice}
          active={choice === locale}
          // A key LOOKED UP over the closed locale union, not a ternary. The ternary this replaced
          // compiled, passed every test, and would have announced a third approved locale to a
          // screen-reader user as "Filipino" - see `LOCALE_NAME_KEYS` in `copy.ts`, which is now
          // what makes a third locale a type-check failure instead of a silent mislabel.
          name={t(LOCALE_NAME_KEYS[choice])}
        />
      ))}
    </form>
  );
}
