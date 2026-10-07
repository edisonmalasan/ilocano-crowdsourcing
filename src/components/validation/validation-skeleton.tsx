import { Card } from "@/components/ui/card";
import { answerOptionClasses } from "@/components/validation/answer-option";
import {
  ENTRY_CARD_INNER_CLASS,
  ENTRY_CARD_SECTION_CLASS,
} from "@/components/validation/entry-card";
import { sentenceSkeletonLineWidths } from "@/lib/validation/sentence-skeleton";

/**
 * ============================================================================
 * THE VALIDATION SKELETON
 * ============================================================================
 * A layout-stable placeholder for the moments a participant genuinely waits
 * (the `/validate` start orchestration, the session route resolution, and
 * the entry-to-entry transition) and for audited loading states with a
 * predictable layout (recovery/resume, next-batch navigation).
 *
 * Shared geometry, not redrawn boxes: the sentence card renders the real
 * `EntryCard` shell classes, the form renders the real `Card padding="lg"`
 * shell, and each option block renders the real `AnswerGroup` option classes
 * via `answerOptionClasses`. The save-button block mirrors the real Button
 * `size="lg"` geometry (`min-h-13 px-7 py-3.5`, see `button.tsx` SIZES); the
 * geometry-parity suite pins both sides so neither can drift silently.
 *
 * What it is NOT:
 *   - Not research content: every block is a neutral geometric shape. No
 *     sentence-like text, no place names, no Ilocano-like words appear here, so
 *     nothing rendered can be mistaken for a sentence under evaluation. The
 *     upcoming sentence shapes the blocks (line count and widths from its
 *     length only) and is never rendered early.
 *   - Not a failure state: when the underlying work fails, the caller renders
 *     the existing error presentation INSTEAD of this. A skeleton on screen
 *     always means "still loading".
 *   - Not a delay: there is no minimum display time and no fake async work. If
 *     the data is already available the caller renders the real UI instead.
 *   - Not a control: no `button`, no `form`, no focusable content lives here.
 *
 * Accessibility: the visual blocks are `aria-hidden`; the container reports
 * `aria-busy` so assistive technology knows content is arriving, while the
 * surrounding route heading (owned by the caller) preserves page context.
 * No animation classes exist here, so `prefers-reduced-motion` has nothing
 * to reduce and no shimmer can drift in.
 */

export interface ValidationSkeletonProps {
  /**
   * Length of the upcoming sentence, when the server has already returned it
   * (normally via prefetch). Shapes the sentence-card lines only; the text
   * itself is never rendered. `null` or omitted renders the stable generic
   * shape at normal card dimensions.
   */
  readonly upcomingInstructionLength?: number | null;
}

export function ValidationSkeleton({ upcomingInstructionLength = null }: ValidationSkeletonProps) {
  const sentenceWidths = sentenceSkeletonLineWidths(upcomingInstructionLength);
  return (
    <div aria-busy="true" data-skeleton="validation" className="flex flex-col gap-6">
      <div aria-hidden="true" className="flex flex-col gap-6">
        {/* Sentence card block: the real EntryCard shell with length-shaped lines. */}
        <section className={ENTRY_CARD_SECTION_CLASS}>
          <div className={ENTRY_CARD_INNER_CLASS}>
            <div className="flex flex-col gap-3">
              <span className="bg-paper-sunken h-3 w-28 rounded-full" />
              {sentenceWidths.map((width, index) => (
                <span
                  key={index}
                  data-skeleton-line="sentence"
                  className={`bg-paper-sunken rounded-control h-6 ${width}`}
                />
              ))}
            </div>
          </div>
        </section>

        {/* Form block: the real Card shell with the real option geometry, masked. */}
        <Card as="section" padding="lg">
          <div className="flex flex-col gap-6">
            <span className="bg-paper-sunken h-4 w-2/3 rounded-full" />
            <div className="flex flex-col gap-3">
              {[0, 1, 2, 3].map((option) => (
                <div
                  key={option}
                  data-skeleton-line="option"
                  className={answerOptionClasses({ selected: false })}
                >
                  <span className="border-ink grid size-6 shrink-0 place-items-center rounded-full border-2 bg-transparent" />
                  <span className="flex min-w-0 flex-1 flex-col gap-2">
                    <span className="bg-paper-sunken h-4 w-3/4 rounded-full" />
                    <span className="bg-paper-sunken h-3 w-full rounded-full" />
                  </span>
                </div>
              ))}
            </div>
            {/* Save-button block: real Button size="lg" geometry (min-h-13 px-7
                py-3.5, full width), neutral fill, no control semantics. */}
            <div
              data-skeleton-line="button"
              className="border-ink bg-paper-sunken inline-flex min-h-13 w-full items-center justify-center gap-2 border-2 px-7 py-3.5"
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
