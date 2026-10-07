import { cn } from "@/lib/styles/cn";

/**
 * Shared answer-option geometry.
 *
 * Server-safe by construction: no `"use client"` directive and no client-only
 * imports, so both the interactive `AnswerGroup` (a Client Component) and the
 * server-rendered `ValidationSkeleton` (used from route `loading.tsx`
 * boundaries) compute identical option classes from this one module.
 *
 * The research-integrity contract governing these tokens lives beside their
 * consumer in `answer-option.tsx`: the unselected set is a single frozen
 * constant taking no per-option input, and `AnswerGroup` passes no `className`.
 * Do not add a per-option `className` parameter here; that would turn the
 * structural guarantee into a convention. Do not add a `"use client"`
 * directive or a client-only import here either; that would re-taint every
 * server module importing this file, starting with the validation skeleton.
 */

export interface AnswerOptionClassesOptions {
  selected: boolean;
  className?: string;
}

const UNSELECTED =
  "bg-answer-surface border-answer-border text-ink shadow-brutal-sm " +
  "hover:bg-paper-sunken hover:shadow-brutal-md";

const SELECTED = "bg-answer-selected-surface border-ink text-answer-selected-text shadow-brutal-md";

/**
 * Note: the disabled treatment lives in the base class list, not in a parameter. There is
 * deliberately no way to ask for a "disabled but unselected" or "disabled and selected" variant,
 * because a validator cannot choose a disabled option — the group controls that.
 */
export function answerOptionClasses({ selected, className }: AnswerOptionClassesOptions): string {
  return cn(
    "relative flex w-full items-center gap-3 rounded-control border-2 px-4 py-4 text-left",
    "font-display text-base font-bold tracking-tight",
    "transition-[transform,box-shadow,background-color,color] duration-[--duration-fast] " +
      "ease-[--ease-brutal]",
    "active:translate-x-[1px] active:translate-y-[1px] active:shadow-brutal-press",
    "focus-visible:outline-[3px] focus-visible:outline-focus focus-visible:outline-offset-2",
    "disabled:cursor-not-allowed disabled:opacity-50",
    selected ? SELECTED : UNSELECTED,
    className,
  );
}
