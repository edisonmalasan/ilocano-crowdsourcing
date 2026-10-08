# Design

## Context

`eslint.config.mjs` defines the `sadino/no-privileged-imports` rule inline: a
`boundaryPlugin` object whose `create(context)` gates the whole rule on module
kind — `"use client"` directive OR location under `src/components/` — then
reports imports of the `PRIVILEGED_SPECIFIERS` list. The directive test reads
file text (separator-independent); the location test reads `context.filename`
raw. See proposal.md for the measured defect and its control.

## Goals / Non-Goals

**Goals:** the components gate fires identically on backslash and forward-slash
hosts; the repair carries a probe that fails on the old line and passes on the
new one; the existing specifier list, directive behavior, and CI verdicts are
unchanged.

**Non-Goals:** new specifiers; case-insensitive matching (the tree is
lowercase-only and no measurement supports widening); touching the directive
test; restructuring the config into a plugin package; new participant request
logging; any anonymous-study-model change.

## Decisions

- **D1 — Normalize, then match.** Replace
  `context.filename.includes("/components/")` with a backslash-to-slash
  normalization of `context.filename` before the same substring test.
  Alternative (split on both separators and compare segments) rejected: more
  code for no additional discrimination — the substring test's meaning is
  unchanged, only its input is canonicalized.
- **D2 — Export the plugin object for direct testing.** Add a named export of
  `boundaryPlugin` from `eslint.config.mjs`. The flat-config default export is
  untouched, so lint behavior is identical; the export exists so the probe can
  drive the real rule. Alternative (CLI spawn on a temp fixture) rejected: it
  touches the working tree, costs an eslint startup per case, and needs a long
  timeout — the exact flake shape this repository keeps recording.
- **D3 — Probe at the rule layer with `Linter.verify`.** Cases, each with the
  same privileged import (`@/lib/supabase/admin`):
  1. filename `C:\repo\src\components\probe.tsx`, no directive → one
     `no-privileged-imports` error (fails on the old line, passes on the new).
  2. filename `/repo/src/components/probe.tsx`, no directive → one error
     (passes before and after — guards the POSIX path against the fix).
  3. filename `C:\repo\src\lib\probe.ts`, no directive → zero errors (the
     server-side allowance is preserved).
  4. filename `C:\repo\src\lib\probe.ts` WITH `"use client"` → one error (the
     directive path is preserved on a backslash host).
  `Linter` flat-mode `verify(code, config, { filename })` passes the filename
  through to `context.filename`; the probe asserts the filename the rule saw
  contains a backslash in the Windows cases, so a runner that normalized it
  could not silently satisfy case 1.
- **D4 — One ADDED scenario, zero MODIFIED requirements.** The in-force
  requirement ("No client-side access to privileged persistence internals")
  already mandates static enforcement; the delta adds the cross-platform
  scenario the old line violated. Sync appends it; nothing else moves.
- **D5 — Record the AGENTS.md repair note at Apply.** The durable-rules file
  carries a paragraph prescribing exactly this repair ("should be its own
  small change with its own probe"); landing the change without correcting
  that paragraph would leave a prescription for work already done. One
  corrective sentence, no rule change.

## Risks / Trade-offs

- [`Linter` filename handling] → If flat-mode `verify` normalizes or rejects a
  Windows-style filename, case 1 cannot observe the defect and the probe must
  refuse rather than pass vacuously (D3's backslash assertion). Verified during
  Apply by running the probe against the old line first (must be red).
- [Specifier-list drift] → Untouched by construction; the probe imports the
  plugin, not a copy of the list, so list edits flow through.

## Migration Plan

No migration. Config-only change plus one test file; rollback is a revert. The
ledger and roadmap advance by the normal stage lifecycle.

## Open Questions

None.
