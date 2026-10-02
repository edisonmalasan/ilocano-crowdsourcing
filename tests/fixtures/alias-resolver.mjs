/**
 * The resolve hook, as a real file so it can be registered by URL.
 *
 * `src/lib` is imported through the project's `@/*` path alias, which a bundler resolves but plain
 * Node does not. This hook supplies the same mapping, which is exactly what `tsx` does in
 * production — so a module graph that loads under this hook is a graph `tsx` can load.
 *
 * Only `resolve` is defined. A `load` hook is deliberately NOT provided: Node's own loader handles
 * `.ts` in this Node version, and adding a custom `load` would give this harness a second way to
 * succeed for the wrong reason.
 *
 * WHY A FILE AND NOT A `data:` URL
 * -------------------------------
 * The first version inlined the hook as a `data:text/javascript,…` string. On Windows the second
 * argument to `register` is the PARENT URL and an absolute path was passed, so Node read the `c:`
 * as a URL scheme and refused the whole thing — before any of the hook's logic ran. A harness that
 * fails that way produces an error mentioning neither the alias nor the module under test, which is
 * why it reads as a code failure rather than an instrument failure at a glance. Real file, real
 * `file://` URL.
 */
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const ROOT = path.resolve(process.env.PROBE_ALIAS_SRC ?? process.cwd());
const SRC = path.join(ROOT, "src");

/**
 * Resolves one path the way a BUNDLER would, not the way Node would.
 *
 * Two Node-ESM rules bite here, and both have nothing to do with the module under test:
 *
 *   1. A DIRECTORY import is refused (`ERR_UNSUPPORTED_DIR_IMPORT`) where a bundler reads
 *      `index.ts`. `@/lib/repositories` is exactly such a directory.
 *   2. An EXTENSIONLESS specifier is refused. Node's ESM resolver requires `./errors.ts`, while this
 *      project writes `./errors` throughout — which is what the bundler and `tsx` both resolve.
 *
 * The second one is why this hook exists at all rather than only handling `@/`: an alias mapping
 * alone gets past the alias and then dies on the project's own ordinary import style.
 *
 * The candidate order is this project's own: the path as given, then `.ts`, then `.js`, then
 * `index.ts`, then `index.js`. `tsx` resolves extensionless specifiers the same way, which is the
 * whole reason this hook can stand in for it.
 *
 * NOTHING MATCHING falls through to `next()` with the ORIGINAL specifier, so Node reports the
 * failure in its own words. A harness that invents its own "module not found" hides the real cause
 * behind its own.
 */
function withCandidates(target) {
  const candidates = [
    target,
    `${target}.ts`,
    `${target}.js`,
    path.join(target, "index.ts"),
    path.join(target, "index.js"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return pathToFileURL(candidate).href;
    }
  }
  return null;
}

export function resolve(specifier, context, next) {
  const aliased = specifier.startsWith("@/") ? path.join(SRC, specifier.slice(2)) : null;
  if (aliased) {
    const href = withCandidates(aliased);
    return next(href ?? specifier, context);
  }

  // A relative or absolute path specifier, resolved against its importer. `context.parentURL` is a
  // `file://` URL, so this is the only place a Windows drive letter enters the picture.
  if (/^\.{1,2}\//.test(specifier) || path.isAbsolute(specifier)) {
    const parentDir = context.parentURL ? path.dirname(fileURLToPath(context.parentURL)) : ROOT;
    const target = path.resolve(parentDir, specifier);
    const href = withCandidates(target);
    if (href) return next(href, context);
  }

  return next(specifier, context);
}
