/**
 * =============================================================================================
 * RE-DERIVE the client-shell call-site worklist by MEASUREMENT. Read-only with respect to the
 * committed tree: it mutates two source files and restores them in a `finally`, then refuses to
 * exit 0 if either file is not byte-identical afterwards.
 * =============================================================================================
 *
 * HOW TO RUN IT
 * -------------
 *     node --check tests/tools/rederive-shell-worklist.mjs
 *     node tests/tools/rederive-shell-worklist.mjs
 *
 * `node --check` FIRST, and the reason is specific rather than ceremonial: a syntax error in this
 * file exits 1 and runs nothing, which is byte-for-byte the signal a scored red gives. A probe that
 * did not run and a probe that ran and found a failure look identical if you read only the exit
 * code. This is the fourth shape, `DID-NOT-PARSE`, and it is the dangerous one.
 *
 * REQUIRES a clean working tree for the two files it mutates. It restores what it found, but it
 * restores *its own* read, so an edit made while it runs would be silently overwritten.
 *
 * =============================================================================================
 * WHY THE INHERITED FIGURE HAD TO BE DISCARDED
 * =============================================================================================
 * The status ledger carried "21 unguarded client-shell call sites, two of them critical" forward as
 * the next objective for five merged changes. That figure cannot be used as a worklist:
 *
 *   1. It is an ENUMERATION, and the archived change that produced it says so itself — "an
 *      enumeration in this project is a claim to be re-derived, not a fact to be inherited."
 *   2. Its anchors were LINE NUMBERS, and every one of them had moved across those five changes.
 *   3. Worse, its LABELS did not survive re-reading. The archived table called one line "S21, the
 *      PRIMARY submit disabled, critical". In the current file `disabled={isPending}` occurs
 *      exactly ONCE and belongs to the `AnswerGroup` (the five options), while BOTH buttons bind
 *      `disabled={submitState.disabled}`. A probe anchored on the archived label therefore mutates
 *      the *skip* affordance and reports it as the primary submit — a wrong experiment wearing a
 *      right one's name, which would have produced a confidently wrong finding.
 *
 * So this probe does not consume the enumeration. It enumerates the CURRENT file, anchors every
 * mutation on text asserted to occur a KNOWN number of times, and reports what the suite does.
 *
 * =============================================================================================
 * WHAT IT DOES AND DOES NOT ESTABLISH
 * =============================================================================================
 * "Mutating this call site leaves the whole unit project green" is a real, reproducible measurement.
 * It says the specified behaviour at that site is not pinned by any test in the unit project.
 *
 * It does NOT say the site is wrong. Every site here may be correct today. It says a correct
 * implementation is one edit away from a wrong one with nothing to stop it, which is the exact
 * hazard the archived change spent six review rounds closing.
 *
 * NOT IN SCOPE, and a green here must not be read as anything about them: the `dom` project, the
 * `integration` project, and `typecheck`. A green means "nothing in the unit project", full stop.
 * Running this before the DOM guards existed is how the ledger figure was originally re-derived;
 * running it now reproduces the *post*-repair position, which should report the same ten sites all
 * guarded.
 *
 * =============================================================================================
 * DISCIPLINE, each point of it earned by a defect recorded elsewhere in this repository
 * =============================================================================================
 *   - Four-way outcome: GREEN, RED, DID-NOT-RUN, DID-NOT-PARSE. The last two are REFUSED, never
 *     scored. On Windows, `execFileSync("pnpm", …)` without a shell cannot spawn the `pnpm` shim and
 *     fails ENOENT, which a naive harness scores as "the test went red".
 *   - The discriminator is `res.status === undefined` — did the process run — not the exit code.
 *     `tsc --noEmit` exits 2 on a type error, not 1.
 *   - Negative control FIRST, on the unmodified tree, AT THIS SCOPE. A red after a mutation means
 *     nothing if the control was already red.
 *   - Occurrence count ASSERTED before mutating, so an ambiguous anchor is INCONCLUSIVE rather than
 *     a silent mutation of whichever occurrence came first.
 *   - Well-formedness BY RECONSTRUCTION: the mutant is spliced back and must equal the original.
 *   - Every red attributed to NAMED failing tests, and a red with zero captured names is
 *     **NOT ATTRIBUTABLE** and is refused rather than counted as a guard.
 *   - Restore in `finally`, verified per file by content hash.
 */
/**
 * ESM rather than CommonJS because `@typescript-eslint/no-privileged-imports`'s sibling rule,
 * `no-require-imports`, forbids `require()`. That is the whole reason this is `.mjs`: the tool is
 * written to the project's lint rules rather than exempted from them with a disable directive.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Both Vitest projects, and why reporting only one of them would be misleading.
 *
 * The `--project unit` figure is the HISTORICAL measurement: it is what the ledger's re-derived
 * number was, and it is still what it reports, because the guards added for these sites live in the
 * separate `dom` project and `unit` does not include them. So a `--project unit`-only run of this
 * script reports "7 unguarded of 10" **indefinitely and correctly** — it is measuring the wrong
 * question once the DOM guards exist.
 *
 * A verdict is therefore per-scope, and a site counts as GUARDED if ANY scope catches it. That is
 * the only reading that describes the repository rather than one slice of it. The `dom` scope is
 * slower per run and is listed last so the faster one establishes the baseline first.
 */
const SCOPES = ["--project unit", "--project dom"];

const SF = path.join(ROOT, "src", "app", "start", "screening-form.tsx");
const RV = path.join(ROOT, "src", "components", "onboarding", "resume-validator.tsx");

const hash = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);

const GREEN = "GREEN";
const RED = "RED";
const DID_NOT_RUN = "DID-NOT-RUN";
const DID_NOT_PARSE = "DID-NOT-PARSE";
const INCONCLUSIVE = "INCONCLUSIVE";

/**
 * Strip ANSI. The escape byte is REQUIRED in the first alternative.
 *
 * Written without it — as `/\[[0-9;]*[A-Za-z]/` — the `[` matches literally, every strip leaves a
 * bare U+001B in front of the text, and `^\s*FAIL` captures NOTHING. That has silently scored real
 * reds as green four times in this repository, which is why both notations are handled here: the
 * 0x1b byte for real terminal output, and the two literal characters `^[` that `gh run view --log`
 * substitutes for it.
 */
const strip = (s) => s.replace(/\u001b\[[0-9;]*[A-Za-z]|\^\[[0-9;]*[A-Za-z]/g, "");

const read = (p) => fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");

function runTests(scope) {
  // `shell: true` is the only way `pnpm` runs at all on Windows; without it the shim is ENOENT.
  // Elsewhere the command is spawned directly, so a genuinely missing `pnpm` still surfaces as a
  // spawn failure rather than being hidden behind a shell's own exit code.
  const isWindows = process.platform === "win32";
  const res = isWindows
    ? spawnSync("cmd.exe", ["/d", "/s", "/c", `pnpm exec vitest run ${scope}`], {
        cwd: ROOT,
        encoding: "utf8",
        shell: true,
        maxBuffer: 256 * 1024 * 1024,
      })
    : spawnSync("pnpm", ["exec", "vitest", "run", scope], {
        cwd: ROOT,
        encoding: "utf8",
        maxBuffer: 256 * 1024 * 1024,
      });

  if (res.error) return { outcome: DID_NOT_RUN, output: "", detail: String(res.error.message) };
  if (res.status === null || res.status === undefined) {
    return {
      outcome: DID_NOT_RUN,
      output: `${res.stdout || ""}${res.stderr || ""}`,
      detail: `status=${res.status}`,
    };
  }
  return {
    outcome: res.status === 0 ? GREEN : RED,
    output: `${res.stdout || ""}${res.stderr || ""}`,
    status: res.status,
  };
}

/**
 * Classify one run. Returns the verdict, or one of the two refusal shapes.
 *
 * The order matters. A mutant that breaks TypeScript makes the suite report `no tests`, which is a
 * COLLECTION failure and not a behavioural one — a mutation that corrupts the artefact makes almost
 * any assertion fail, so a red from one proves nothing about the site being probed. And a red whose
 * failing test names were not captured is NOT ATTRIBUTABLE, because an empty capture is
 * indistinguishable from a run that reported nothing.
 */
function classify(result) {
  if (result.outcome === DID_NOT_RUN) return { verdict: DID_NOT_RUN, detail: result.detail };

  const clean = strip(result.output);
  const summary = /\bTests\s+([^\r\n]*)/.exec(clean);
  const summaryText = summary ? summary[1].trim() : "";
  const files = /\bTest Files\s+([^\r\n]*)/.exec(clean);
  const named = [...clean.matchAll(/^\s*(?:FAIL|×)\s+(.{10,})$/gm)].map((m) => m[1].trim());

  if (/Failed Suites/.test(clean) || /^no tests/i.test(summaryText)) {
    return { verdict: DID_NOT_PARSE, detail: "collection failed; the mutant is malformed", named };
  }
  if (!summaryText) {
    return { verdict: DID_NOT_PARSE, detail: "no Tests summary captured", named };
  }
  if (result.outcome === RED && named.length === 0) {
    return {
      verdict: INCONCLUSIVE,
      detail: "RED with zero captured names - NOT ATTRIBUTABLE",
      named,
    };
  }
  return { verdict: result.outcome, named, summaryText, filesText: files ? files[1].trim() : "" };
}

function report(what, classified) {
  if (classified.verdict === DID_NOT_RUN) {
    console.log(`    ${what}: DID-NOT-RUN (${classified.detail}) - REFUSING TO SCORE`);
    return;
  }
  if (classified.verdict === DID_NOT_PARSE) {
    console.log(`    ${what}: DID-NOT-PARSE (${classified.detail}) - REFUSING TO SCORE`);
    return;
  }
  const line = [classified.summaryText, classified.filesText].filter(Boolean).join("  ");
  console.log(`    ${what}: exit ${classified.exit}  ${line || "<none captured>"}`);
  for (const name of classified.named.slice(0, 6)) console.log(`        FAILING: ${name}`);
  if (classified.named.length > 6) {
    console.log(`        …and ${classified.named.length - 6} more not listed`);
  }
}

/** Replace the `occurrence`-th (0-based) appearance of `from`. Returns null if absent. */
function splice(source, from, to, occurrence = 0) {
  let at = -1;
  for (let n = 0; n <= occurrence; n += 1) {
    at = source.indexOf(from, at < 0 ? 0 : at + from.length);
    if (at < 0) return null;
  }
  return source.slice(0, at) + to + source.slice(at + from.length);
}

const occurrences = (source, needle) => {
  let n = 0;
  let i = 0;
  while ((i = source.indexOf(needle, i)) >= 0) {
    n += 1;
    i += needle.length;
  }
  return n;
};

/** The common prefix/suffix DELTA, not the replacement text. */
function delta(before, after) {
  let p = 0;
  while (p < before.length && p < after.length && before[p] === after[p]) p += 1;
  let s = 0;
  while (
    s < before.length - p &&
    s < after.length - p &&
    before[before.length - 1 - s] === after[after.length - 1 - s]
  ) {
    s += 1;
  }
  const from = before
    .slice(p, before.length - s)
    .replace(/\s+/g, " ")
    .trim();
  const to = after
    .slice(p, after.length - s)
    .replace(/\s+/g, " ")
    .trim();
  return [`      - ${from || "(nothing)"}`, `      + ${to || "(removed)"}`];
}

/**
 * The re-derived worklist.
 *
 * `expect` is the number of times the anchor MUST occur — an assertion, not a guess, so a refactor
 * that moves or duplicates a site makes this probe INCONCLUSIVE rather than quietly measuring a
 * different site than the one named above it.
 */
const PROBES = [
  // ---------------- screening-form.tsx
  {
    id: "SF-1",
    file: SF,
    legacy: "~S23/S18 (archived labels do not match)",
    severity: "medium",
    what: "AnswerGroup `disabled={isPending}`: options stay clickable mid-write",
    from: "disabled={isPending}",
    to: "disabled={false}",
    expect: 1,
  },
  {
    id: "SF-2",
    file: SF,
    legacy: "~S21 (the archive calls the PRIMARY submit; it is not)",
    severity: "critical",
    what: "PRIMARY Continue `disabled={submitState.disabled}` (occurrence 0): double press mints two validators",
    from: "disabled={submitState.disabled}",
    to: "disabled={false}",
    occurrence: 0,
    expect: 2,
  },
  {
    id: "SF-3",
    file: SF,
    legacy: "~S18",
    severity: "medium",
    what: "SKIP button `disabled={submitState.disabled}` (occurrence 1)",
    from: "disabled={submitState.disabled}",
    to: "disabled={false}",
    occurrence: 1,
    expect: 2,
  },
  {
    id: "SF-4",
    file: SF,
    legacy: "~S5",
    severity: "critical",
    what: "`enrollValidatorAction({ ilocanoProficiency: answer })` -> `null`: records a decline for every participant",
    from: "ilocanoProficiency: answer",
    to: "ilocanoProficiency: null",
    expect: 1,
  },
  {
    id: "SF-5",
    file: SF,
    legacy: "~S2",
    severity: "low",
    what: '`router.push("/ready")` removed: an enrolled participant is returned to the question',
    from: 'router.push("/ready");',
    to: "// removed",
    expect: 1,
  },
  {
    id: "SF-6",
    file: SF,
    legacy: "~S22",
    severity: "medium",
    what: "`onChange` drops the parse: `setSelection(toIlocanoProficiency(value))` -> `setSelection(null)`",
    from: "setSelection(toIlocanoProficiency(value))",
    to: "setSelection(null)",
    expect: 1,
  },
  // ---------------- resume-validator.tsx
  {
    id: "RV-1",
    file: RV,
    legacy: "~R2",
    severity: "critical",
    what: "`readStoredValidatorId()` -> `null`: resume is dead, a returning validator is told they hold nothing",
    from: "const stored = readStoredValidatorId();",
    to: "const stored = null;",
    expect: 1,
  },
  {
    id: "RV-2",
    file: RV,
    legacy: "~R6",
    severity: "critical",
    what: '`router.push("/ready")` removed: a restored validator is told they hold no identity',
    from: 'router.push("/ready");',
    to: "// removed",
    expect: 1,
  },
  {
    id: "RV-3",
    file: RV,
    legacy: "~R7",
    severity: "critical",
    what: "`clearStoredValidatorId()` removed: the message claims a clear that never happens",
    from: "clearStoredValidatorId();",
    to: "// removed",
    expect: 1,
  },
  {
    id: "RV-4",
    file: RV,
    legacy: "~R9",
    severity: "critical",
    what: "`setMessage(decision.message)` -> `setMessage(null)`: swallows a failed resume entirely",
    from: "setMessage(decision.message);",
    to: "setMessage(null);",
    expect: 1,
  },
];

const originals = new Map([
  [SF, read(SF)],
  [RV, read(RV)],
]);

console.log(`repo:   ${ROOT}`);
console.log(`scopes: ${SCOPES.map((s) => `\`vitest run ${s}\``).join("  and  ")}`);
console.log(
  "NOT in scope: the `integration` project, and typecheck. A green verdict here says nothing about\n" +
    "             either of them, and no real browser has rendered any screen in this project.\n",
);
for (const [p, s] of originals) {
  console.log(`  ${path.relative(ROOT, p)}  ${s.length} bytes  sha256 ${hash(s)}`);
}
console.log();

console.log("=== NEGATIVE CONTROL: the UNMODIFIED tree must be green at EVERY scope ===");
for (const scope of SCOPES) {
  const raw = runTests(scope);
  const control = classify(raw);
  report(`control ${scope}`, { ...control, exit: raw.status });
  if (control.verdict !== GREEN) {
    console.log(
      "  CONTROL FAILED at this scope - a red-after-mutation result would mean nothing. STOPPING.\n" +
        "  (A suite that is genuinely red on an unmodified tree is a finding of its own.)",
    );
    process.exit(3);
  }
}
console.log("  controls green at every scope; probes can proceed.\n");

const verdicts = [];
for (const probe of PROBES) {
  console.log(`=== ${probe.id} (${probe.severity}) ===`);
  console.log(`  what   : ${probe.what}`);
  console.log(`  legacy : ${probe.legacy}`);

  const src = originals.get(probe.file);
  const found = occurrences(src, probe.from);
  if (found !== probe.expect) {
    console.log(
      `  ANCHOR COUNT MISMATCH: expected ${probe.expect}, found ${found}. INCONCLUSIVE - refusing to mutate.`,
    );
    verdicts.push({ ...probe, verdict: INCONCLUSIVE, why: "anchor count mismatch" });
    console.log();
    continue;
  }

  const mutant = splice(src, probe.from, probe.to, probe.occurrence ?? 0);
  const reconstructed = splice(src, probe.from, probe.from, probe.occurrence ?? 0);
  if (mutant === null || reconstructed !== src) {
    console.log("  MUTATION MALFORMED (reconstruction check failed). INCONCLUSIVE.");
    verdicts.push({ ...probe, verdict: INCONCLUSIVE, why: "malformed mutation" });
    console.log();
    continue;
  }

  console.log(`  mutant : sha256 ${hash(mutant)}  (${mutant.length} bytes)`);
  for (const line of delta(src, mutant)) console.log(line);

  // One write, then EVERY scope reads the same mutant. The mutant is not re-written per scope, so
  // no scope can observe a different file than the one whose hash is printed above.
  const perScope = [];
  try {
    fs.writeFileSync(probe.file, mutant, "utf8");
    for (const scope of SCOPES) {
      const raw = runTests(scope);
      const classified = classify(raw);
      report(scope, { ...classified, exit: raw.status });
      perScope.push({ scope, ...classified });
    }
  } finally {
    fs.writeFileSync(probe.file, originals.get(probe.file), "utf8");
  }

  // A refusal is NEVER downgraded to a verdict, and never averaged away. `DID-NOT-PARSE` in
  // particular must not become GUARDED, which is the whole error this script exists to avoid.
  const refused = perScope.filter((r) => r.verdict !== GREEN && r.verdict !== RED);
  const caught = perScope.filter((r) => r.verdict === RED);

  let verdict;
  let why;
  if (refused.length > 0) {
    verdict = INCONCLUSIVE;
    why = `${refused[0].scope}: ${refused[0].detail}`;
  } else if (caught.length > 0) {
    verdict = "GUARDED";
    why = `caught by ${caught.map((c) => c.scope).join(" + ")}`;
  } else {
    verdict = "UNGUARDED";
  }
  console.log(`  => ${verdict}${why ? `  (${why})` : ""}`);
  verdicts.push({ ...probe, verdict, why });
  console.log();
}

console.log("=== RESTORE ===");
let clean = true;
for (const [p, s] of originals) {
  const now = read(p);
  const ok = now === s;
  clean = clean && ok;
  console.log(`  ${path.relative(ROOT, p)} byte-identical: ${ok}  (sha256 ${hash(now)})`);
}
if (!clean) {
  console.log(
    "\n  RESTORE FAILED. The working tree has been modified by this script; `git status` will show it.",
  );
  process.exitCode = 5;
}

console.log("\n=== RE-DERIVED WORKLIST ===");
const order = { UNGUARDED: 0, INCONCLUSIVE: 1, GUARDED: 2 };
verdicts.sort((a, b) => order[a.verdict] - order[b.verdict]);
for (const v of verdicts) {
  console.log(
    `  ${v.id.padEnd(5)} ${v.verdict.padEnd(12)} ${v.severity.padEnd(8)} ${v.what.slice(0, 92)}` +
      (v.why ? `  [${v.why}]` : ""),
  );
}

const unguarded = verdicts.filter((v) => v.verdict === "UNGUARDED");
const inconclusive = verdicts.filter((v) => v.verdict === INCONCLUSIVE);
const guarded = verdicts.length - unguarded.length - inconclusive.length;
console.log(
  `\n  ${unguarded.length} unguarded, ${guarded} guarded, ${inconclusive.length} inconclusive, of ${PROBES.length} probed.`,
);
const crit = unguarded.filter((v) => v.severity === "critical");
console.log(
  `  unguarded and rated critical: ${crit.length} (${crit.map((c) => c.id).join(", ") || "none"})`,
);
console.log(
  "\n  A green here means NO Vitest project in scope observes that site. 'Unguarded' is not 'wrong';\n" +
    "  it means a correct implementation is one edit from a wrong one with nothing to stop it.",
);

if (inconclusive.length > 0 || !clean) {
  console.log(
    `\n  Exiting non-zero: ${inconclusive.length} probe(s) refused to produce a verdict, so this run does not\n` +
      "  establish the full picture. An inconclusive probe is not a guarded one.",
  );
  process.exitCode = process.exitCode || 1;
}
