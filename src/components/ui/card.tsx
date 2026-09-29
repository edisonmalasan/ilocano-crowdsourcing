import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/styles/cn";

/**
 * Content surface: the primary compartment in every layout.
 *
 * Bold 2px ink border plus a hard zero-blur offset shadow. The card is the structural unit that
 * separates information zones — the brutalist layer's "visible compartmentalisation" — softened by
 * a 12px radius and the raised paper surface so it does not read as harsh.
 *
 * `inset` swaps the raised surface for the sunken one and drops the shadow, for content that is
 * already nested inside a card and would otherwise stack three heavy borders.
 */

export type CardTone = "raised" | "inset" | "accent";
export type CardPadding = "none" | "sm" | "md" | "lg";

export interface CardClassesOptions {
  tone?: CardTone;
  padding?: CardPadding;
  as?: "div" | "section" | "article" | "li" | "aside";
  className?: string;
}

const TONES: Record<CardTone, string> = {
  raised: "bg-paper-raised shadow-brutal-md",
  inset: "bg-paper-sunken shadow-none",
  accent: "bg-accent-tint shadow-brutal-sm",
};

const PADDINGS: Record<CardPadding, string> = {
  none: "",
  sm: "p-4",
  md: "p-5 sm:p-6",
  lg: "p-6 sm:p-8",
};

export function cardClasses({
  tone = "raised",
  padding = "md",
  className,
}: CardClassesOptions = {}): string {
  return cn("rounded-card border-2 border-ink", TONES[tone], PADDINGS[padding], className);
}

export interface CardProps extends HTMLAttributes<HTMLElement> {
  tone?: CardTone;
  padding?: CardPadding;
  as?: "div" | "section" | "article" | "li" | "aside";
  children: ReactNode;
}

export function Card({
  tone = "raised",
  padding = "md",
  as: Tag = "div",
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <Tag {...rest} className={cardClasses({ tone, padding, className })}>
      {children}
    </Tag>
  );
}

export function CardHeader({ className, children, ...rest }: HTMLAttributes<HTMLElement>) {
  return (
    <div
      {...rest}
      className={cn(
        "border-ink flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b-2 pb-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 {...rest} className={cn("text-heading", className)}>
      {children}
    </h3>
  );
}

export function CardBody({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cn("mt-4", className)}>
      {children}
    </div>
  );
}
