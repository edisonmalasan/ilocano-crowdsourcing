/**
 * A real module that really writes to the filesystem, through EVERY API the scan knows.
 *
 * THIS FILE IS A TEST FIXTURE AND IS NEVER EXECUTED.
 *
 * It exists because `tests/unit/import-dataset-command.test.ts` has to prove its own write-scan can
 * fire, and the only honest way to do that is to point the scan at a real file on disk rather than at
 * a string literal written inside the test. A literal would make the control circular: it would pass
 * exactly when the scanner matches the literal, which is the `Object.keys({ en: 1, fil: 1 })` shape
 * this repository has already found twice in its own guards.
 *
 * The scan is a source-text scan, so the calls do not need to be reachable, correct, or harmless —
 * they only have to BE THERE. It is placed here, in `tests/fixtures/`, rather than in `scripts/`,
 * because the guard under test asserts that nothing under `scripts/` writes. A fixture in the
 * guarded directory would make the guard fail for the right reason at the wrong time, which is
 * indistinguishable from the guard working.
 *
 * ONE FUNCTION PER PATTERN, and that is the point. An earlier version of this fixture contained a
 * single `writeFileSync` call, so the control proved the scanner runs and that one pattern still
 * matches — and said nothing about the other fifteen, including the three broadest. The control
 * now asserts every pattern in `WRITE_APIS` fires against this file, so a pattern that stops
 * matching (a renamed API, a narrowed regex) fails loudly rather than degrading into fifteen
 * sixteenths of a guard.
 *
 * The calls go through the `fs` namespace object rather than named imports, because a named import
 * line — `import { writeFileSync, rmSync, ... } from "node:fs"` — would satisfy every pattern by
 * itself, and the control would then prove the scanner matches an import list rather than a call.
 */
import * as fs from "node:fs";

export function writeSomething(target: string, contents: string): void {
  fs.writeFileSync(target, contents, "utf8");
}

export function appendSomething(target: string, contents: string): void {
  fs.appendFileSync(target, contents, "utf8");
}

export function streamSomething(target: string): fs.WriteStream {
  return fs.createWriteStream(target);
}

export function openSomething(target: string): number {
  return fs.openSync(target, "w");
}

export function truncateSomething(target: string): void {
  fs.truncateSync(target);
}

export function unlinkSomething(target: string): void {
  fs.unlinkSync(target);
}

export function removeSomething(target: string): void {
  fs.rmSync(target);
}

export function renameSomething(oldTarget: string, newTarget: string): void {
  fs.renameSync(oldTarget, newTarget);
}

export function copySomething(source: string, target: string): void {
  fs.cpSync(source, target);
}

export function copyFileSomething(source: string, target: string): void {
  fs.copyFileSync(source, target);
}

export function chmodSomething(target: string, mode: number): void {
  fs.chmodSync(target, mode);
}

export function chownSomething(target: string, uid: number, gid: number): void {
  fs.chownSync(target, uid, gid);
}

export function removeDirSomething(target: string): void {
  fs.rmdirSync(target);
}

export function makeDirSomething(target: string): void {
  fs.mkdirSync(target);
}

export function linkSomething(existing: string, target: string): void {
  fs.linkSync(existing, target);
}

export function symlinkSomething(target: string, targetPath: string): void {
  fs.symlinkSync(target, targetPath);
}
