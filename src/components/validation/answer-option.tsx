"use client";

import { useCallback, useId, useRef, useState } from "react";

import { cn } from "@/lib/styles/cn";

/**
 * Validation answer option.
 *
 * ============================ RESEARCH INTEGRITY ============================
 * A validator's answer is research data. Therefore, by contract, every option
 * presents an IDENTICAL surface, border, and shadow before selection, and the
 * accent colour is reachable ONLY when `selected` is true.
 *
 * This is enforced structurally, not by discipline: `answerOptionClasses` picks
 * between exactly two token sets, and the unselected set contains no accent
 * token at all. A component that renders an answer option therefore cannot
 * express a preference between options, even by accident.
 *
 * Rejected by the same rule: colouring an option red/green by "correctness",
 * sorting options so the agreeable one is first, and adding a micro-animation
 * to one option that the others do not have.
 * =============================================================================
 *
 * Keyboard: rendered as `role="radio"` inside a `role="radiogroup"`, with
 * roving `tabIndex` and arrow-key/Home/End navigation, so a validator can move
 * through the four options without tabbing through each one.
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

export interface AnswerOption {
  value: string;
  label: string;
  /** Optional short clarifier shown under the label. Never an endorsement. */
  hint?: string;
}

export interface AnswerGroupProps {
  /** The approved question, shown as the group label. */
  legend: string;
  options: readonly AnswerOption[];
  value: string | null;
  onChange: (value: string) => void;
  /** Short guidance rendered above the options, outside the group. */
  hint?: string;
  error?: string;
  disabled?: boolean;
  className?: string;
}

export function AnswerGroup({
  legend,
  options,
  value,
  onChange,
  hint,
  error,
  disabled = false,
  className,
}: AnswerGroupProps) {
  const groupId = useId();
  const hintId = `${groupId}-hint`;
  const errorId = `${groupId}-error`;
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [focusIndex, setFocusIndex] = useState(() => {
    const selectedIndex = options.findIndex((option) => option.value === value);
    return selectedIndex >= 0 ? selectedIndex : 0;
  });

  const describedBy =
    [hint ? hintId : undefined, error ? errorId : undefined].filter(Boolean).join(" ") || undefined;

  const moveFocus = useCallback(
    (nextIndex: number) => {
      const bounded = (nextIndex + options.length) % options.length;
      setFocusIndex(bounded);
      optionRefs.current[bounded]?.focus();
    },
    [options.length],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      switch (event.key) {
        case "ArrowDown":
        case "ArrowRight":
          event.preventDefault();
          moveFocus(index + 1);
          break;
        case "ArrowUp":
        case "ArrowLeft":
          event.preventDefault();
          moveFocus(index - 1);
          break;
        case "Home":
          event.preventDefault();
          moveFocus(0);
          break;
        case "End":
          event.preventDefault();
          moveFocus(options.length - 1);
          break;
        default:
          break;
      }
    },
    [moveFocus, options.length],
  );

  return (
    <div className={className}>
      <p id={hintId} className={cn("text-small text-ink-muted", hint ? "mb-3" : "sr-only")}>
        {hint ?? legend}
      </p>

      <div
        role="radiogroup"
        aria-label={legend}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        className="flex flex-col gap-3"
      >
        {options.map((option, index) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              ref={(node) => {
                optionRefs.current[index] = node;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              // Roving tabindex: exactly one option is in the tab order.
              tabIndex={index === focusIndex ? 0 : -1}
              onClick={() => {
                setFocusIndex(index);
                onChange(option.value);
              }}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={answerOptionClasses({ selected })}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full border-2",
                  selected ? "border-ink bg-ink" : "border-ink bg-transparent",
                )}
              >
                {selected ? <span className="bg-accent-brass size-2 rounded-full" /> : null}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block">{option.label}</span>
                {option.hint ? (
                  <span
                    className={cn(
                      "text-small mt-0.5 block font-normal tracking-normal",
                      selected ? "text-answer-selected-text/85" : "text-ink-muted",
                    )}
                  >
                    {option.hint}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      {error ? (
        <p
          id={errorId}
          role="alert"
          className="text-small text-status-alert mt-3 flex items-start gap-2 font-semibold"
        >
          <span aria-hidden="true">△</span>
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
