import { cn } from "@/lib/styles/cn";

/**
 * Batch progress.
 *
 * Three independent ways of communicating the same fact, so the state survives greyscale,
 * colour-blindness, and a screen reader:
 *   1. A visible `Item N of M` text label.
 *   2. A segmented track where completed segments are ink-filled and pending ones are outlined —
 *      a shape difference, not just a colour difference.
 *   3. `role="progressbar"` with `aria-valuenow` / `aria-valuemin` / `aria-valuemax` and an
 *      `aria-valuetext` that reads out the position in words.
 *
 * There is deliberately no timer, no streak, and no rate indicator anywhere in this component:
 * the roadmap forbids pressure toward speed over careful validation.
 */

export type SegmentState = "complete" | "current" | "pending";

export function segmentState(index: number, current: number): SegmentState {
  if (index < current) return "complete";
  if (index === current) return "current";
  return "pending";
}

const SEGMENT: Record<SegmentState, string> = {
  // Filled vs outlined is a shape/fill difference, not only a colour difference.
  complete: "bg-ink border-ink",
  current: "bg-accent border-ink",
  pending: "bg-transparent border-ink-faint",
};

export function segmentClasses(state: SegmentState): string {
  return cn(
    "h-2.5 flex-1 rounded-xs border-2 transition-colors duration-[--duration-fast]",
    SEGMENT[state],
  );
}

export function progressTrackClasses({ className }: { className?: string } = {}): string {
  return cn("h-2.5 w-full rounded-xs border-2 border-ink bg-paper-sunken", className);
}

/**
 * The participant-visible strings, pre-composed by the caller.
 *
 * They are STRINGS rather than format functions or a format string on purpose. "Item 3 of 10" and
 * "Pangungusap 3 ng 10" are one fact with two grammars, and a `"Item {n} of {m}"` template would
 * force one language to carry the other's word order. The caller already knows the numbers and holds
 * the catalog, so it composes them there — in the participant's language — and this component stays
 * free of a localization dependency it has no way to serve correctly for every locale.
 */
export interface BatchProgressLabels {
  /** The accessible name of the progressbar. */
  readonly progress: string;
  /** The position readout, e.g. "Sentence 3 of 10". */
  readonly item: string;
  /** The completion readout, e.g. "2 saved". */
  readonly saved: string;
}

/**
 * The English defaults, kept exactly as they were before `labels` existed.
 *
 * A caller that omits `labels` must get byte-identical markup to the version that had no such prop,
 * so these strings are the previous literals rather than a re-derivation of them.
 */
const DEFAULT_LABELS: BatchProgressLabels = {
  progress: "Batch progress",
  item: "Item {index} of {total}",
  saved: "{completed} saved",
};

export interface BatchProgressProps {
  /** 1-based position of the entry currently being judged. */
  index: number;
  /** Entries in the batch. */
  total: number;
  /**
   * How many are complete, when that is NOT derivable from `index`.
   *
   * `index - 1` is only the completed count when a validator has worked strictly forwards through the
   * batch. A session that excludes already-answered entries can present position 3 while five
   * responses are stored, so the server's own count is passed in rather than recomputed. The
   * segments still follow `index`, because they describe where the participant IS, not how much
   * exists.
   */
  completed?: number;
  /** Localized strings. Omitting them preserves the previous English rendering exactly. */
  labels?: BatchProgressLabels;
  className?: string;
}

export function BatchProgress({ index, total, completed, labels, className }: BatchProgressProps) {
  const safeTotal = Math.max(1, total);
  const safeIndex = Math.min(Math.max(index, 1), safeTotal);
  const completedCount = Math.min(Math.max(completed ?? safeIndex - 1, 0), safeTotal);

  const shown = labels ?? DEFAULT_LABELS;
  const item = shown.item
    .replace("{index}", String(safeIndex))
    .replace("{total}", String(safeTotal));
  const saved = shown.saved.replace("{completed}", String(completedCount));

  return (
    <div className={cn("w-full", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="label-meta text-ink-muted">{item}</p>
        <p className="label-meta text-ink-faint">{saved}</p>
      </div>

      <div
        className="mt-2 flex w-full items-center gap-1"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={safeTotal}
        aria-valuenow={safeIndex}
        aria-valuetext={`${item}, ${saved}`}
        aria-label={shown.progress}
      >
        {Array.from({ length: safeTotal }, (_, offset) => {
          const segmentIndex = offset + 1;
          const state = segmentState(segmentIndex, safeIndex);
          return (
            <span
              key={segmentIndex}
              className={segmentClasses(state)}
              // Segment position is decorative; the text label and progressbar carry the meaning.
              aria-hidden="true"
            />
          );
        })}
      </div>
    </div>
  );
}
