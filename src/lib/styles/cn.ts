/**
 * Minimal class-name joiner.
 *
 * This project does not need `clsx`/`tailwind-merge`: every class in the system comes from a
 * dedicated token utility, so there are no conflicting Tailwind groups to arbitrate. Adding a
 * merge library would be a speculative dependency for a problem this codebase does not have.
 *
 * Falsy entries are dropped so conditional classes read cleanly at call sites.
 */
export type ClassValue = string | number | null | undefined | false | ClassValue[];

export function cn(...values: ClassValue[]): string {
  const out: string[] = [];

  for (const value of values) {
    if (value === null || value === undefined || value === false || value === "") continue;

    if (Array.isArray(value)) {
      const nested = cn(...value);
      if (nested) out.push(nested);
      continue;
    }

    out.push(String(value));
  }

  return out.join(" ");
}
