import type { AllocatedEntry } from "@/schemas/batch";

/**
 * ============================================================================
 * THE RESEARCH MATERIAL ON THE VALIDATION SCREEN
 * ============================================================================
 * One file holds the Ilocano sentence a validator is judging, and it imports NOTHING from
 * `@/lib/i18n/copy`. That is not an accident of file layout; it is the mechanism behind
 * `tests/unit/locale-research-boundary.test.ts`, and the reason that guard can be a real guard rather
 * than a scan that cries wolf.
 *
 * The invariant is: a stored sentence is rendered as stored, and no interface-locale preference can
 * change, reorder, replace, or omit it. A catalog is a convenient place for a string, which is
 * exactly why routing research material through one would be dangerous — a lookup keyed by
 * anything derived from the sentence, or a mistyped key rendering a different string in its place,
 * would silently corrupt what a participant was shown and therefore what they judged.
 *
 * This component therefore takes an `AllocatedEntry` and renders `entry.instruction` as a text node.
 * Its surrounding chrome — the heading, the field labels, the progress — belongs to the route, which
 * may localize it. The split is along the exact line the requirement draws: research material is
 * fixed, presentation is localized, and the two never meet.
 *
 * NOTHING here interprets the sentence, offers a suggested correction, or marks a field as
 * suspicious. The sentence is the artefact under evaluation; a screen that helped too much would
 * change the data.
 */

export interface EntryCardProps {
  /** The single entry this session is presenting. */
  readonly entry: AllocatedEntry;
  /**
   * Visible heading for the compartment. Passed in rather than looked up, so this file holds no
   * localized copy of its own — a heading is chrome, and chrome belongs to whoever knows the locale.
   */
  readonly label: string;
  readonly instructionLabel: string;
}

/**
 * The research material on the validation screen: the Ilocano sentence, and
 * nothing else of the entry. Intended endpoints and the dataset identifier
 * are research-internal — comparison against a stated intent was producing
 * confusion rather than signal, and the identifier is researchers-only — so
 * the component has no prop that could display them. Narrowing the props
 * rather than conditionally hiding is what makes a reintroduction a type
 * error instead of a flag flip.
 */

export function EntryCard({ entry, label, instructionLabel }: EntryCardProps) {
  return (
    <section
      aria-label={label}
      className="rounded-card border-ink bg-paper-raised shadow-brutal-md border-2"
    >
      <div className="px-5 py-4 sm:px-6 sm:py-5">
        <p className="label-meta text-ink-muted">{instructionLabel}</p>
        {/* The sentence itself. `lang` is declared so a screen reader switches voice rather than
            reading Ilocano text with an English voice, which is the difference between an
            intelligible sentence and an unintelligible one. No catalog lookup touches this value. */}
        <p lang="ilo" className="font-display text-ink mt-2 text-xl leading-relaxed font-bold">
          {entry.instruction}
        </p>
      </div>
    </section>
  );
}
