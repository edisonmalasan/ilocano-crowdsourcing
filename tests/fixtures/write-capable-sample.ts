/**
 * A real module that really writes to the filesystem.
 *
 * THIS FILE IS A TEST FIXTURE AND IS NEVER EXECUTED.
 *
 * It exists because `tests/unit/import-dataset-command.test.ts` has to prove its own write-scan can
 * fire, and the only honest way to do that is to point the scan at a real file on disk rather than at
 * a string literal written inside the test. A literal would make the control circular: it would pass
 * exactly when the scanner matches the literal, which is the `Object.keys({ en: 1, fil: 1 })` shape
 * this repository has already found twice in its own guards.
 *
 * The scan is a source-text scan, so the call does not need to be reachable, correct, or harmless —
 * it only has to BE THERE. It is placed here, in `tests/fixtures/`, rather than in `scripts/`,
 * because the guard under test asserts that nothing under `scripts/` writes. A fixture in the
 * guarded directory would make the guard fail for the right reason at the wrong time, which is
 * indistinguishable from the guard working.
 *
 * `writeFileSync` is deliberately the FIRST and only call, so a scanner whose patterns were all
 * wrong would report zero hits and the control would name exactly one missing pattern rather than a
 * confusing partial match.
 */
import { writeFileSync } from "node:fs";

export function writeSomething(path: string, contents: string): void {
  writeFileSync(path, contents, "utf8");
}
