import type { ReactNode } from "react";

/**
 * The shared Validating page shell.
 *
 * One server-safe module (no `"use client"`) owning the geometry every validating
 * state shares: the main container width, page padding, the "Validating" heading,
 * the description, and the spacing before the content slot. Rendered by the
 * `/validate` start page, the session route's presenting state, and the session
 * route's loading fallback — so the three cannot drift and the handoff from the
 * start skeleton to the first real entry moves no heading, description, container,
 * or padding.
 */
export interface ValidationPageShellProps {
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
  /**
   * The finished screen omits the heading: "This batch is finished" already says
   * where the participant is, so a second heading plus the task introduction would
   * be orientation for a task that is over. Every other state keeps it.
   */
  readonly hideHeading?: boolean;
}

export function ValidationPageShell({
  title,
  description,
  children,
  hideHeading = false,
}: ValidationPageShellProps) {
  return (
    <main id="main" className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      {hideHeading ? null : (
        <>
          <h1 className="text-title">{title}</h1>
          <p className="text-lead text-ink-muted mt-3">{description}</p>
        </>
      )}

      <div className="mt-8 flex flex-col gap-6">{children}</div>
    </main>
  );
}
