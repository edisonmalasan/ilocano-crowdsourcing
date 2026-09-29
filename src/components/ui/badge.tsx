import { cn } from "@/lib/styles/cn";

/**
 * Small-caps monospace metadata label.
 *
 * This is the brutalist layer's "micro-typography": uppercase, wide tracking, monospaced, used for
 * entry IDs, counts, provenance, and status text. It is deliberately never used for prose.
 *
 * `tone` maps to genuine application semantics (saved / error / attention) and never to a
 * validation answer — see `answer-option.tsx` for the neutrality rule.
 */

export type BadgeTone = "neutral" | "accent" | "ok" | "alert" | "info";

export interface BadgeClassesOptions {
  tone?: BadgeTone;
  className?: string;
}

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-paper-sunken text-ink border-ink",
  accent: "bg-accent text-paper border-accent-press",
  ok: "bg-status-ok-tint text-status-ok border-status-ok",
  alert: "bg-status-alert-tint text-status-alert border-status-alert",
  info: "bg-status-info-tint text-status-info border-status-info",
};

export function badgeClasses({ tone = "neutral", className }: BadgeClassesOptions = {}): string {
  return cn(
    "label-meta inline-flex items-center gap-1.5 rounded-pill border-2 px-2.5 py-1 whitespace-nowrap",
    TONES[tone],
    className,
  );
}

export interface BadgeProps {
  tone?: BadgeTone;
  className?: string;
  children: React.ReactNode;
}

export function Badge({ tone = "neutral", className, children }: BadgeProps) {
  return <span className={badgeClasses({ tone, className })}>{children}</span>;
}
