import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { answerOptionClasses } from "@/components/validation/answer-option-styles";

/**
 * The validation-skeleton server boundary — regression guard for the
 * production crash with digest `4202103721`:
 * `Attempted to call answerOptionClasses() from the server but
 * answerOptionClasses is on the client`.
 *
 * `ValidationSkeleton` renders from server-side route boundaries
 * (`src/app/validate/[batchId]/loading.tsx`), so it must never call a
 * function imported from a `"use client"` module. The single authoritative
 * helper lives in the server-safe `answer-option-styles.ts`, used by both the
 * real `AnswerGroup` options and the skeleton placeholders.
 *
 * WHAT THIS PROVES AND WHAT IT DOES NOT
 * These are source-text scans plus one same-process value check. They fire
 * regardless of the test runtime's leniency: vitest happily imports across
 * the boundary that Next.js enforces at runtime, so an import-behavior test
 * could never reproduce the crash — only the source address of each import
 * can. Nothing here boots Next.js or a real browser.
 */

const SRC = join(process.cwd(), "src");

function readSrc(...segments: string[]): string {
  return readFileSync(join(SRC, ...segments), "utf8");
}

function hasClientDirective(source: string): boolean {
  return /^\s*(?:"use client"|'use client')/.test(source);
}

/** Every static import specifier in a module source. */
function importSpecifiers(source: string): string[] {
  const matches = source.matchAll(/import\s+(?:[^'"]+\s+from\s+)?['"]([^'"]+)['"]/g);
  return [...matches].map((match) => match[1] ?? "");
}

/**
 * Resolve a `@/`-aliased specifier to a source file under `src/`, or null
 * when it names a package or a path this guard does not police.
 */
function resolveSrcModule(specifier: string): string | null {
  if (!specifier.startsWith("@/")) return null;
  const relative = specifier.slice(2);
  for (const candidate of [`${relative}.ts`, `${relative}.tsx`]) {
    try {
      return readSrc(...candidate.split("/"));
    } catch {
      continue;
    }
  }
  return null;
}

const STYLES = readSrc("components", "validation", "answer-option-styles.ts");
const SKELETON = readSrc("components", "validation", "validation-skeleton.tsx");
const ANSWER_OPTION = readSrc("components", "validation", "answer-option.tsx");
const LOADING = readSrc("app", "validate", "[batchId]", "loading.tsx");

describe("the shared option-geometry module is server-safe", () => {
  it("carries no client directive", () => {
    expect(hasClientDirective(STYLES)).toBe(false);
  });

  it("imports nothing client-only: every import resolves to the pure classnames helper", () => {
    expect(importSpecifiers(STYLES)).toEqual(["@/lib/styles/cn"]);
  });
});

describe("the skeleton never reaches across the server/client boundary", () => {
  it("is itself a server module", () => {
    expect(hasClientDirective(SKELETON)).toBe(false);
  });

  it("imports the geometry helper from the shared server-safe module", () => {
    expect(SKELETON).toContain("@/components/validation/answer-option-styles");
    expect(SKELETON).toContain("answerOptionClasses");
  });

  it("imports no value from any client module", () => {
    const clientSources = importSpecifiers(SKELETON)
      .map((specifier) => ({ specifier, source: resolveSrcModule(specifier) }))
      .filter((entry): entry is { specifier: string; source: string } => entry.source !== null)
      .filter((entry) => hasClientDirective(entry.source));
    expect(clientSources.map((entry) => entry.specifier)).toEqual([]);
  });
});

describe("the real options still use the same shared helper", () => {
  it("imports the helper from the shared module instead of defining its own", () => {
    expect(ANSWER_OPTION).toContain("./answer-option-styles");
    expect(ANSWER_OPTION).not.toMatch(/function answerOptionClasses/);
    expect(ANSWER_OPTION).not.toMatch(/export (function|const) answerOptionClasses/);
  });

  it("the shared helper still produces the unselected geometry the contract pins", () => {
    const unselected = answerOptionClasses({ selected: false });
    expect(unselected).toContain("border-2");
    expect(unselected).not.toBe(answerOptionClasses({ selected: true }));
  });
});

describe("the route loading boundary still renders the skeleton", () => {
  it("imports the skeleton from the server-safe validation module", () => {
    expect(LOADING).toContain("@/components/validation/validation-skeleton");
    expect(LOADING).toContain("ValidationSkeleton");
  });
});
