import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/styles/cn";

/**
 * Soft neo-brutalist button.
 *
 * Every visual property resolves to a design-system token: a 2px ink border, a hard zero-blur
 * offset shadow that collapses on press, and a slightly softened 10px radius. There are no raw
 * values here, and the refinement layer's pill/`backdrop-blur` treatment is deliberately absent
 * — a solid tactile control reads better on a phone and never costs a blur pass.
 *
 * Accessibility notes:
 * - `focus-visible` gets a 3px ink ring, so the state is never signalled by colour alone.
 * - A disabled button sets the `disabled` attribute (so it is not focusable or activatable) and
 *   additionally mirrors it to `aria-disabled` for assistive technology that reports state
 *   without honouring `disabled`.
 * - `type` defaults to `button`, because an unlabelled `<button>` inside a `<form>` submits it.
 */

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";
export type ButtonSize = "md" | "lg";

export interface ButtonClassesOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
}

const BASE =
  "inline-flex items-center justify-center gap-2 border-2 border-ink font-display font-bold " +
  "uppercase tracking-tight transition-[transform,box-shadow,background-color] " +
  "duration-[--duration-fast] ease-[--ease-brutal] select-none " +
  "focus-visible:outline-[3px] focus-visible:outline-focus focus-visible:outline-offset-2 " +
  "disabled:pointer-events-none disabled:opacity-45";

const VARIANTS: Record<ButtonVariant, string> = {
  // Single accent carries primary action. Hover and press are distinct, tactile states.
  primary:
    "bg-accent text-paper shadow-brutal-md hover:bg-accent-hover hover:shadow-brutal-lg active:bg-accent-press active:shadow-brutal-press",
  // Neutral raised surface. Equal in visual weight to its siblings, so a group of buttons never
  // implies a preference the product has not established.
  secondary:
    "bg-paper-raised text-ink shadow-brutal-sm hover:bg-paper-sunken hover:shadow-brutal-md active:bg-paper-inset active:shadow-brutal-press",
  quiet:
    "bg-transparent text-ink-muted shadow-none hover:bg-paper-sunken hover:text-ink active:bg-paper-inset",
  danger:
    "bg-status-alert text-paper shadow-brutal-sm hover:brightness-95 hover:shadow-brutal-md active:shadow-brutal-press",
};

const SIZES: Record<ButtonSize, string> = {
  // Minimum touch target stays at or above 44px in both sizes.
  md: "min-h-11 px-5 py-2.5 text-sm",
  lg: "min-h-13 px-7 py-3.5 text-base",
};

/**
 * Pure class builder, exported so the token contract can be asserted in a test without
 * rendering. Every branch here is token-only by construction.
 */
export function buttonClasses({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className,
}: ButtonClassesOptions = {}): string {
  return cn(BASE, VARIANTS[variant], SIZES[size], fullWidth && "w-full", className);
}

/**
 * Class builder for a control that navigates instead of acting.
 *
 * A link must not be a `<button>`: a button activates on Space, a link on Enter, and a validator
 * navigating with the keyboard should get the behaviour the role promises. This is exported from
 * the same token set so an `<a>` is visually identical to a `<button>` without duplicating styles.
 *
 * Callers must supply their own focus handling — a plain anchor already receives the global
 * `:focus-visible` treatment from `globals.css`, which is what this relies on.
 */
export function linkButtonClasses({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className,
}: ButtonClassesOptions = {}): string {
  return cn(buttonClasses({ variant, size, fullWidth }), "no-underline", className);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className,
  type = "button",
  disabled = false,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      className={buttonClasses({ variant, size, fullWidth, className })}
    >
      {children}
    </button>
  );
}
