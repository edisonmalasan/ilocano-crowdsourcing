# Proposal

## Why

The `sadino/no-privileged-imports` lint rule is one of three enforcements of the
server/client trust boundary, and it is the one CI asserts (`pnpm run lint` on
`ubuntu-latest`). Its component gate — `context.filename.includes("/components/")`
in `eslint.config.mjs` — matches only forward-slash paths. On Windows
`context.filename` is a native backslash path, so a presentation component under
`src/components/` that omits its own `"use client"` directive and imports a
privileged module escapes the rule entirely on a developer machine.

Measured this session on Windows, before any edit: a directive-less fixture under
`src/components/` importing `@/lib/supabase/admin` exits lint **0** (defect),
while the identical fixture with `"use client"` exits **1** naming
`sadino/no-privileged-imports` (control — the rule works, the gate is blind).
Both fixtures were deleted; the tree is clean. There is no live breach
(`src/components/validation/entry-card.tsx` imports only `@/schemas/batch`), and
CI is unaffected (forward-slash paths), so this is a local-assurance hole, not
an open door — but a boundary that reports green for a violation on one platform
is a boundary that teaches its reader to trust green, and it must be repaired in
its own change with its own probe.

## What Changes

- Normalize path separators before the components-directory test in the rule, so
  the gate fires identically on backslash and forward-slash hosts.
- Export the rule's plugin object from `eslint.config.mjs` so a unit test can
  drive the real rule through ESLint's `Linter` with a Windows-style filename —
  no fixture files in the tree, no CLI spawn, no timeout flake.
- Add a rule-level probe suite: backslash component path without a directive
  reports; POSIX component path without a directive reports; non-component path
  without a directive stays silent; `"use client"` anywhere still reports.
- One ADDED scenario on `data-access-boundary` pinning the cross-platform gate;
  no requirement text changes, no specifier-list changes, no migration, no new
  dependency, no anonymous-study-model change.

## Capabilities

### New Capabilities

(none — behavior attaches to an existing capability)

### Modified Capabilities

- `data-access-boundary`: one ADDED scenario (directive-less presentation
  component importing a privileged module fails lint on any host OS). Zero
  MODIFIED requirements.

## Impact

- `eslint.config.mjs` (gate normalization plus a named export; rule semantics
  otherwise byte-unchanged) and one new unit test file.
- Developer-visible: `pnpm run lint` on Windows now reports violations it
  previously passed silently. CI output is unchanged (the rule already fired
  there). No participant, researcher, export, schema, or methodology change.
