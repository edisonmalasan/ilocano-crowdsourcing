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

export interface BatchProgressProps {
  /** 1-based position of the entry currently being judged. */
  index: number;
  /** Entries in the batch. */
  total: number;
  className?: string;
}

export function BatchProgress({ index, total, className }: BatchProgressProps) {
  const safeTotal = Math.max(1, total);
  const safeIndex = Math.min(Math.max(index, 1), safeTotal);
  const completed = safeIndex - 1;

  return (
    <div className={cn("w-full", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="label-meta text-ink-muted">
          Item {safeIndex} of {safeTotal}
        </p>
        <p className="label-meta text-ink-faint">{completed} saved</p>
      </div>

      <div
        className="mt-2 flex w-full items-center gap-1"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={safeTotal}
        aria-valuenow={safeIndex}
        aria-valuetext={`Item ${safeIndex} of ${safeTotal}, ${completed} saved`}
        aria-label="Batch progress"
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
