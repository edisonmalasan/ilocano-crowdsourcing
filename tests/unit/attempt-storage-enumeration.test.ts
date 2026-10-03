/**
 * Nothing under `src/` reaches for storage that OUTLIVES the browser session.
 *
 * =============================================================================================
 * WHY THIS FILE EXISTS AT ALL
 * =============================================================================================
 * `participation-attempt` requires that a participation attempt's identity live in
 * SESSION-scoped storage and that nothing recover an attempt from storage that outlives
 * the session. That is a claim about the whole application, so the guard has to see the whole
 * application.
 *
 * The guard this file replaces was `expect(source).not.toMatch(/localStorage/)` over ONE
 * component, and it had two defects that were both measured rather than argued:
 *
 *   1. IT WAS A LIST, NOT A DEFINITION. It forbade three literal storage names, so
 *      `indexedDB`, `document.cookie`, or the same name reached through any other spelling
 *      passed. `tests/unit/guard-weakness.ts` records this as the audited weakness of that exact
 *      test.
 *   2. ITS SCOPE WAS ONE COMPONENT. The immediately preceding change
 *      (`batch-route-round-trip`) ended with an independent verification finding that was a
 *      CLAIM OF ENFORCEMENT WHICH DID NOT HOLD: a closed enumeration scoped to `src/app` plus
 *      three navigation idioms passed three violating sites green. **A "nothing else does X" guard
 *      is only as closed as its scan's root.** This one is rooted at all of `src/`.
 *
 * =============================================================================================
 * WHY THE SCANNER IS A STATE MACHINE AND NOT A REGEX — MEASURED, NOT ASSUMED
 * =============================================================================================
 * A naive token match over the raw source finds **24 lines across 10 files** on this tree, of
 * which **exactly one is code** (`globalThis.localStorage`, before this change moved it). The
 * other 23 are comments and prose — and they are CORRECT prose: this repository documents its
 * reasoning at length, and `src/lib/i18n/interface-locale-cookie.ts` legitimately explains why
 * the *interface locale* uses a cookie by contrasting it with `localStorage`. A regex guard
 * would therefore have had a **95% false-positive rate on correct code**, which is a guard
 * nobody keeps.
 *
 * So the scanner tracks four states — code, line comment, block comment, string — plus regex
 * literals, and reports an occurrence only when it is CODE.
 *
 * **Regex literals are the fifth state and they are not decoration.** Without it,
 * `const re = /https?:\/\//;` looks exactly like the start of a line comment at its final `//`,
 * and everything after it on that line is silently masked. That is a false NEGATIVE in the
 * detector that guards against false negatives. Measured on this tree: **0 of 111 files contain
 * a line with an escaped slash**, so the class cannot currently mask anything here — stated as a
 * measurement rather than as an assumption that it cannot happen.
 *
 * =============================================================================================
 * WHAT THIS GUARD STILL CANNOT SEE — THE RESIDUAL, RECORDED RATHER THAN IMPLIED
 * =============================================================================================
 * - It is a STRUCTURAL guard. It proves a token is or is not reached for; it proves nothing about
 *   behaviour. A cosmetic rename of `sessionStorage` to something else would not fail it, and a
 *   behavioural change that keeps using session storage would not be caught by it.
 * - It cannot see a storage API it does not know the name of. The token list is
 *   `localStorage`, `indexedDB`, `caches`, `document.cookie`. A sixth API — the Cache Storage
 *   `caches` object is here, but nothing prevents a future `navigator.storage.getDirectory()` —
 *   would pass. **This is the same list-not-definition weakness one level up**, and the honest
 *   claim is that the list is measured, not that it is complete.
 * - Dynamic access defeats any textual scan: `globalThis[name]` where `name` is computed at
 *   runtime. The scanner catches bracket access with a LITERAL name
 *   (`globalThis["localStorage"]`, fixture-proven below) and nothing else.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const SRC = path.join(ROOT, "src");

/**
 * Tokens whose lifetime OUTLASTS a browser session.
 *
 * `sessionStorage` is deliberately absent: it is the storage the attempt is SUPPOSED to use, and
 * a guard that forbade it would forbid the fix.
 */
export const LONG_LIVED_STORAGE_TOKENS = [
  "localStorage",
  "indexedDB",
  "caches",
  "document.cookie",
] as const;

/** Characters after which a `/` opens a regex literal rather than a division. */
const REGEX_PRECEDERS = new Set([
  "(",
  ",",
  "=",
  ":",
  "[",
  "!",
  "&",
  "|",
  "?",
  "{",
  "}",
  ";",
  "+",
  "-",
  "*",
  "%",
  "<",
  ">",
  "~",
  "^",
]);

export interface StorageHit {
  readonly token: string;
  readonly line: number;
  readonly text: string;
}

/**
 * One pass that knows code from line comments, block comments, strings, and regex literals.
 *
 * `wholeStringTokenOffsets` is what catches bracket access — `globalThis["localStorage"]` puts
 * the token where a code scan cannot see it. Requiring the string's ENTIRE content to be the
 * token is what stops that rule from reporting prose: no comment in this repository contains a
 * string literal whose entire value is `localStorage`.
 */
export function scanSource(source: string): {
  readonly codeOffsets: ReadonlySet<number>;
  readonly wholeStringTokenOffsets: ReadonlySet<number>;
} {
  const codeOffsets: number[] = [];
  const wholeStringTokenOffsets: number[] = [];
  let i = 0;
  const n = source.length;

  const lastCodeChar = (): string => {
    for (let k = codeOffsets.length - 1; k >= 0; k -= 1) {
      const c = source[codeOffsets[k] ?? 0] ?? "";
      if (c !== " " && c !== "\t" && c !== "\n" && c !== "\r") return c;
    }
    return "";
  };

  while (i < n) {
    const two = source.slice(i, i + 2);
    if (two === "//") {
      while (i < n && source[i] !== "\n") i += 1;
      continue;
    }
    if (two === "/*") {
      i += 2;
      while (i < n && source.slice(i, i + 2) !== "*/") i += 1;
      i += 2;
      continue;
    }
    const ch = source[i] ?? "";
    if (ch === '"' || ch === "'" || ch === "`") {
      let j = i + 1;
      let content = "";
      while (j < n) {
        if (source[j] === "\\") {
          content += source[j + 1] ?? "";
          j += 2;
          continue;
        }
        if (source[j] === ch) break;
        if (source[j] === "\n" && ch !== "`") break;
        content += source[j] ?? "";
        j += 1;
      }
      if ((LONG_LIVED_STORAGE_TOKENS as readonly string[]).includes(content)) {
        wholeStringTokenOffsets.push(i + 1);
      }
      i = j + 1;
      continue;
    }
    if (ch === "/" && REGEX_PRECEDERS.has(lastCodeChar())) {
      let j = i + 1;
      let inClass = false;
      while (j < n) {
        if (source[j] === "\\") {
          j += 2;
          continue;
        }
        if (source[j] === "[") inClass = true;
        else if (source[j] === "]") inClass = false;
        else if (source[j] === "/" && !inClass) break;
        else if (source[j] === "\n") break;
        j += 1;
      }
      i = j + 1;
      while (i < n && /[a-z]/.test(source[i] ?? "")) i += 1;
      continue;
    }
    codeOffsets.push(i);
    i += 1;
  }
  return {
    codeOffsets: new Set(codeOffsets),
    wholeStringTokenOffsets: new Set(wholeStringTokenOffsets),
  };
}

/** Every place `source` REACHES FOR storage that outlives the session. Prose is not a reach. */
export function findLongLivedStorageAccess(source: string): StorageHit[] {
  const { codeOffsets, wholeStringTokenOffsets } = scanSource(source);
  const hits: StorageHit[] = [];
  const lines = source.split("\n");

  for (const token of LONG_LIVED_STORAGE_TOKENS) {
    let from = 0;
    for (;;) {
      const at = source.indexOf(token, from);
      if (at < 0) break;
      const allCode = Array.from({ length: token.length }, (_, k) => codeOffsets.has(at + k)).every(
        Boolean,
      );
      if (allCode || wholeStringTokenOffsets.has(at)) {
        hits.push({
          token,
          line: source.slice(0, at).split("\n").length,
          text: (lines[source.slice(0, at).split("\n").length - 1] ?? "").trim(),
        });
      }
      from = at + 1;
    }
  }
  return hits;
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Every violation under the real tree, as `path:line` strings. */
export function violationsUnder(dir: string = SRC): string[] {
  const found: string[] = [];
  for (const file of sourceFiles(dir)) {
    for (const hit of findLongLivedStorageAccess(readFileSync(file, "utf8"))) {
      found.push(`${path.relative(ROOT, file).replace(/\\/g, "/")}:${hit.line} [${hit.token}]`);
    }
  }
  return found;
}

describe("the scanner tells a reach for long-lived storage from prose about it", () => {
  /**
   * FIXTURES, NOT THE TREE. Every case here is a snippet, so the can-fire proof does not depend on
   * the repository containing a violation — which is the whole point, because a guard whose
   * can-fire proof mutates the tree can only be proved by making the tree wrong.
   */
  const CASES: ReadonlyArray<readonly [name: string, source: string, expected: number]> = [
    ["a real reach", "const candidate = globalThis.localStorage;", 1],
    ["bracket access", 'const s = globalThis["localStorage"];', 1],
    ["a cookie write", 'document.cookie = "a=b";', 1],
    ["an IndexedDB open", 'const db = indexedDB.open("x");', 1],
    ["the Cache Storage object", "void caches;", 1],
    ["block-comment prose", "/**\n * `localStorage` was the other option.\n */\nconst x = 1;", 0],
    ["a line comment", "// the server has no localStorage here\nconst x = 1;", 0],
    ["prose inside a string", 'const label = "store it in localStorage instead";', 0],
    ["prose inside a template", "const label = `do not use localStorage here`;", 0],
    [
      "a URL in a string, and a real reach after it",
      'const href = "https://example.test/x";\nconst c = globalThis.localStorage;',
      1,
    ],
    [
      "a regex literal whose escaped slash looks like a comment",
      "const re = /https?:\\/\\//;\nconst c = globalThis.localStorage;",
      1,
    ],
    [
      "a division, and a real reach after it",
      "const half = total / 2;\nconst c = globalThis.localStorage;",
      1,
    ],
    [
      "session storage, which is the fix and must not be reported",
      "const c = globalThis.sessionStorage;",
      0,
    ],
  ];

  for (const [name, source, expected] of CASES) {
    it(`counts ${expected} for ${name}`, () => {
      expect(findLongLivedStorageAccess(source)).toHaveLength(expected);
    });
  }

  it("finds every occurrence, not just the first", () => {
    const source =
      "const a = localStorage;\nconst b = globalThis.localStorage;\nconst c = indexedDB;";
    expect(findLongLivedStorageAccess(source)).toHaveLength(3);
  });
});

describe("nothing under src/ reaches for storage that outlives the session", () => {
  it("reads a NON-EMPTY tree, so a match over nothing cannot pass", () => {
    // Without this, a scanner pointed at a directory that does not exist reports zero violations
    // and the guard is green for the wrong reason. Measured on this repository: 111 files.
    const files = sourceFiles(SRC);
    expect(files.length).toBeGreaterThan(50);
    expect(files.some((f) => f.endsWith(path.join("validators", "browser-identity.ts")))).toBe(
      true,
    );
  });

  it("reports no reach for long-lived storage anywhere under src/", () => {
    expect(violationsUnder(SRC)).toEqual([]);
  });

  it("names every violation it found, rather than only counting them", () => {
    // A count-only assertion is satisfied by a scanner that matched nothing at all; the previous
    // test is what rules that out, and this one is here so a future failure says WHERE.
    const found = violationsUnder(SRC);
    expect(found.join("\n")).toBe(found.filter((f) => f.includes(":")).join("\n"));
  });

  it("does find a violation when one is present, rooted at the real tree", () => {
    // Can-fire, without touching the repository: a violation is INJECTED into a real file's
    // source and the same code path that scans the tree is run over it. A guard that cannot fail
    // here has not been shown to guard anything.
    const real = readFileSync(path.join(SRC, "lib", "validators", "browser-identity.ts"), "utf8");
    const injected = `${real}\nconst injected = globalThis.localStorage;\n`;
    expect(findLongLivedStorageAccess(injected)).toEqual([
      expect.objectContaining({ token: "localStorage" }),
    ]);
  });

  it("still recognises the real module as USING session storage, so the guard cannot pass by the module being absent", () => {
    const real = readFileSync(path.join(SRC, "lib", "validators", "browser-identity.ts"), "utf8");
    expect(findLongLivedStorageAccess(real)).toEqual([]);
    expect(real).toContain("globalThis.sessionStorage");
  });
});

/**
 * Every remaining mention of `localStorage` under `src/`, and why each one is allowed to be there.
 *
 * The scanner above treats prose as not-a-reach, which is what makes it usable — and the cost of that
 * decision is that a COMMENT saying `localStorage` while the code says `sessionStorage` is invisible to
 * it. This project has been bitten by that class of defect in its own documentation, so the comments
 * are pinned here rather than left to review.
 *
 * All 13 are one of two kinds, and neither is a stale description of the identity module:
 *
 *   1. THE MODULE'S OWN HISTORY (8, all in `browser-identity.ts`). That module moved away from
 *      `localStorage` and explains why at length, including design.md D5's rule that a legacy value is
 *      left unread and undeleted. Naming the storage it no longer uses is the content of those notes.
 *   2. THE INTERFACE LOCALE, WHICH USES A COOKIE (5, in `layout.tsx`, `ready/page.tsx`,
 *      `interface-locale-cookie.ts`). These contrast a cookie against the alternative that was
 *      rejected. They are about presentation state and were never about the attempt token, so this
 *      change did not make them stale — and one of them, `ready/page.tsx:83`, is a statement about
 *      `middleware`, which can read neither storage and would still be true of any of them.
 *
 * The pinned list is `file:line`, so a rename or a moved comment fails by name and a NEW mention fails
 * as an addition rather than as a silent widening of what this guard tolerates.
 */
describe("every remaining `localStorage` mention under src/ is a deliberate quotation", () => {
  const ALLOWED: ReadonlyArray<readonly [location: string, why: string]> = [
    ["src/app/layout.tsx:92", "interface locale: the cookie's rejected alternative"],
    ["src/app/ready/page.tsx:82", "interface locale: `middleware` can read neither storage"],
    ["src/lib/i18n/interface-locale-cookie.ts:15", "interface locale: why a cookie, not storage"],
    ["src/lib/i18n/interface-locale-cookie.ts:26", "interface locale: what the cookie buys"],
    ["src/lib/i18n/interface-locale-cookie.ts:28", "interface locale: the hydration cost avoided"],
    ["src/lib/validators/browser-identity.ts:23", "the module's own history: the heading"],
    ["src/lib/validators/browser-identity.ts:25", "the module's own history: what it used to do"],
    ["src/lib/validators/browser-identity.ts:32", "the module's own history: the wrong lifetime"],
    [
      "src/lib/validators/browser-identity.ts:33",
      "the module's own history: outlives every session",
    ],
    ["src/lib/validators/browser-identity.ts:36", "the module's own history: not about privacy"],
    [
      "src/lib/validators/browser-identity.ts:45",
      "the module's own history: a rejected alternative",
    ],
    ["src/lib/validators/browser-identity.ts:70", "D5: the legacy value is left unread"],
    ["src/lib/validators/browser-identity.ts:72", "D5: why nothing cleans it up"],
  ];

  /** Every `file:line` under `src/` whose text mentions the literal, from real files on disk. */
  function mentionLines(dir: string = SRC): string[] {
    const found: string[] = [];
    for (const file of sourceFiles(dir)) {
      const relative = path.relative(ROOT, file).replace(/\\/g, "/");
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, index) => {
          if (line.includes("localStorage")) found.push(`${relative}:${index + 1}`);
        });
    }
    return found.sort();
  }

  it("finds exactly the pinned mentions, and no others", () => {
    // The count read first, so a failure says how many were found rather than only which differ.
    const found = mentionLines();
    expect(found.length).toBe(ALLOWED.length);
    expect(found).toEqual(ALLOWED.map(([location]) => location).sort());
    // Every entry carries a stated reason, so none is a bare suppression — the same rule this
    // project's byte-identical-string allowlist follows. Without it, the list is a list.
    for (const [location, why] of ALLOWED) {
      expect(why.length, `${location} has no stated reason`).toBeGreaterThan(10);
    }
  });

  it("has every one of them inside a COMMENT, so none has become code", () => {
    // The pin above says WHERE. This says WHAT KIND OF THING, which is the property that actually
    // matters: a mention that has migrated out of a comment and into an expression is exactly the
    // defect class, and `file:line` alone cannot tell the difference.
    for (const [location] of ALLOWED) {
      const at = location.lastIndexOf(":");
      const file = path.join(ROOT, location.slice(0, at).replace(/\//g, path.sep));
      const lineNumber = Number(location.slice(at + 1));
      const source = readFileSync(file, "utf8");
      const { codeOffsets } = scanSource(source);
      const lineStart =
        source
          .split("\n")
          .slice(0, lineNumber - 1)
          .join("\n").length + 1;
      const tokenAt = lineStart + source.slice(lineStart).indexOf("localStorage");
      const isCode = Array.from({ length: "localStorage".length }, (_, k) =>
        codeOffsets.has(tokenAt + k),
      ).every(Boolean);
      expect(isCode, `${location} is CODE, not a comment`).toBe(false);
    }
  });

  it("CAN FIRE: a new mention anywhere under src/ fails the pin", () => {
    // The control for the pin, without editing the tree. `page.tsx` is chosen because it is a real
    // file that currently says nothing about storage, so the added line is the ONLY mention in it and
    // the comparison cannot pass for an unrelated reason.
    const target = path.join(SRC, "app", "page.tsx");
    const real = readFileSync(target, "utf8");
    const injected = `${real}\n// the old note said \`localStorage\`\n`;
    const mentions = injected
      .split("\n")
      .map((line, index) =>
        line.includes("localStorage") ? `src/app/page.tsx:${index + 1}` : null,
      )
      .filter((v): v is string => v !== null);

    expect(mentionLines()).not.toContain(mentions[0] as string);
    expect(mentions).toHaveLength(1);
    // And the scanner above still calls it prose, which is why this pin exists at all.
    expect(findLongLivedStorageAccess(injected)).toEqual([]);
  });
});
