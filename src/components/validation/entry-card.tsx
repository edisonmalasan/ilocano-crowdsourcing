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
  readonly originLabel: string;
  readonly destinationLabel: string;
  readonly transitModeLabel: string;
  /** Shown in place of `transitMode` when the entry does not state one. */
  readonly transitModeAbsent: string;
}

interface EndpointProps {
  readonly label: string;
  readonly value: string;
}

/**
 * One intended endpoint of a navigation instruction.
 *
 * A `<dl>` pair rather than a bare line so the label and its value are programmatically associated,
 * which is what lets a screen reader answer "where is this sentence going?" without the participant
 * inferring it from layout.
 */
function Endpoint({ label, value }: EndpointProps) {
  return (
    <div className="min-w-0">
      <dt className="label-meta text-ink-muted">{label}</dt>
      <dd className="font-display text-ink mt-1 text-base font-bold break-words">{value}</dd>
    </div>
  );
}

export function EntryCard({
  entry,
  label,
  instructionLabel,
  originLabel,
  destinationLabel,
  transitModeLabel,
  transitModeAbsent,
}: EntryCardProps) {
  return (
    <section
      aria-label={label}
      className="rounded-card border-ink bg-paper-raised shadow-brutal-md border-2"
    >
      <header className="border-ink flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b-2 px-5 py-3">
        <h2 className="text-heading text-ink">{label}</h2>
        {/* The source identifier, shown so a participant can quote it in a report and a researcher
            can match it to a row. It is research data, rendered verbatim, not a UI affordance. */}
        <span className="label-meta text-ink-muted">{entry.id}</span>
      </header>

      <div className="px-5 py-4 sm:px-6 sm:py-5">
        <p className="label-meta text-ink-muted">{instructionLabel}</p>
        {/* The sentence itself. `lang` is declared so a screen reader switches voice rather than
            reading Ilocano text with an English voice, which is the difference between an
            intelligible sentence and an unintelligible one. No catalog lookup touches this value. */}
        <p lang="ilo" className="font-display text-ink mt-2 text-xl leading-relaxed font-bold">
          {entry.instruction}
        </p>
      </div>

      <dl className="border-ink grid grid-cols-1 gap-4 border-t-2 px-5 py-4 sm:grid-cols-2 sm:px-6">
        <Endpoint label={originLabel} value={entry.origin ?? transitModeAbsent} />
        <Endpoint label={destinationLabel} value={entry.destination ?? transitModeAbsent} />
        <Endpoint label={transitModeLabel} value={entry.transitMode ?? transitModeAbsent} />
      </dl>
    </section>
  );
}
