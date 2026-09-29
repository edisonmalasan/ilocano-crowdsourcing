import type { ReactNode } from "react";

import { cn } from "@/lib/styles/cn";

/**
 * Form field: label + control + description + error, wired together.
 *
 * The whole point of this component is that the association is impossible to forget. `Field`
 * generates an id, passes it to the label's `htmlFor` and the control's `id`, and points
 * `aria-describedby` at the description and error nodes when they exist. A control therefore
 * always has an accessible name, and its help text and error are always announced with it.
 *
 * `aria-invalid` is set from `error` alone, so validity is never signalled by colour only — the
 * message text is always present too.
 *
 * The control is passed as a render prop rather than cloned, so the caller keeps full control of
 * the element while the wiring stays in one place.
 */

export interface FieldRenderArgs {
  id: string;
  describedBy: string | undefined;
  invalid: boolean;
}

export interface FieldProps {
  label: ReactNode;
  /** Stable id. When omitted, one is derived from `name`; both avoid React's `useId`. */
  id?: string;
  name?: string;
  description?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
  children: (args: FieldRenderArgs) => ReactNode;
}

export function Field({
  label,
  id,
  name,
  description,
  error,
  required = false,
  className,
  children,
}: FieldProps) {
  const controlId = id ?? (name ? `field-${name}` : undefined);
  const descriptionId = controlId ? `${controlId}-description` : undefined;
  const errorId = controlId ? `${controlId}-error` : undefined;

  const describedBy =
    [description ? descriptionId : undefined, error ? errorId : undefined]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <div className={cn("w-full", className)}>
      <label htmlFor={controlId} className="font-display text-ink text-sm font-bold tracking-tight">
        {label}
        {required ? (
          <span className="text-accent ml-1" aria-hidden="true">
            *
          </span>
        ) : null}
        {required ? <span className="sr-only"> (required)</span> : null}
      </label>

      {description ? (
        <p id={descriptionId} className="text-small text-ink-muted mt-1">
          {description}
        </p>
      ) : null}

      <div className="mt-2">
        {children({
          id: controlId ?? "",
          describedBy,
          invalid: Boolean(error),
        })}
      </div>

      {error ? (
        <p
          id={errorId}
          role="alert"
          className="text-small text-status-alert mt-2 flex items-start gap-2 font-semibold"
        >
          <span aria-hidden="true">△</span>
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

/**
 * Shared control chrome for text inputs, textareas, and selects.
 *
 * Token-only: 2px ink border, 10px radius, raised paper surface, hard offset shadow that
 * flattens on focus so the control reads as "pressed in" rather than "floating above".
 */
export function controlClasses({ invalid = false }: { invalid?: boolean } = {}): string {
  return cn(
    "w-full rounded-control border-2 bg-paper-raised px-4 py-3 text-body text-ink",
    "shadow-brutal-xs transition-shadow duration-[--duration-fast] ease-[--ease-brutal]",
    "placeholder:text-ink-faint",
    "focus:shadow-none focus:outline-[3px] focus:outline-focus focus:outline-offset-2",
    "disabled:cursor-not-allowed disabled:bg-paper-sunken disabled:text-ink-faint",
    invalid && "border-status-alert",
  );
}
