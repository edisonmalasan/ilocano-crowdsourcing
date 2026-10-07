/**
 * ============================================================================
 * THE VALIDATION SKELETON
 * ============================================================================
 * A layout-stable placeholder for the moments a participant genuinely waits on
 * server work with a predictable layout: the `/validate` start orchestration and
 * the validation session route resolution (initial open, next-batch navigation).
 *
 * What it is NOT:
 *   - Not research content: every block is a neutral geometric shape. No
 *     sentence-like text, no place names, no Ilocano-like words appear here, so
 *     nothing rendered can be mistaken for a sentence under evaluation.
 *   - Not a failure state: when the underlying work fails, the caller renders
 *     the existing error presentation INSTEAD of this. A skeleton on screen
 *     always means "still loading".
 *   - Not a delay: there is no minimum display time and no fake async work. If
 *     the data is already available the caller renders the real UI instead.
 *
 * Accessibility: the visual blocks are `aria-hidden`; the container reports
 * `aria-busy` so assistive technology knows content is arriving, while the
 * surrounding route heading (owned by the caller) preserves page context.
 * Any animation is disabled under `prefers-reduced-motion`.
 */

export function ValidationSkeleton() {
  return (
    <div aria-busy="true" data-skeleton="validation" className="flex flex-col gap-6">
      <div aria-hidden="true" className="flex flex-col gap-6">
        {/* Sentence card block: mirrors EntryCard's bordered card with two text lines. */}
        <div className="rounded-card border-ink bg-paper-raised shadow-brutal-md border-2">
          <div className="flex flex-col gap-3 px-5 py-4 sm:px-6 sm:py-5">
            <span className="bg-paper-sunken h-3 w-28 rounded-full" />
            <span className="bg-paper-sunken rounded-control h-6 w-full" />
            <span className="bg-paper-sunken rounded-control h-6 w-4/5" />
          </div>
        </div>

        {/* Form block: mirrors the evaluation question, four options, and the save control. */}
        <div className="rounded-card border-ink bg-paper-raised shadow-brutal-md border-2">
          <div className="flex flex-col gap-3 px-5 py-4 sm:px-6 sm:py-5">
            <span className="bg-paper-sunken h-4 w-2/3 rounded-full" />
            <span className="bg-paper-sunken rounded-control h-12 w-full" />
            <span className="bg-paper-sunken rounded-control h-12 w-full" />
            <span className="bg-paper-sunken rounded-control h-12 w-full" />
            <span className="bg-paper-sunken rounded-control h-12 w-full" />
            <span className="bg-ink-faint/40 rounded-control mt-2 h-12 w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
