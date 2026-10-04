# Design

## Context

See `proposal.md` — Why. The mechanism is deletion; the subtlety is what must
keep working while the card shrinks.

## Goals / Non-Goals

**Goals**

- One sentence on screen, no endpoint block, no identifier, with the
  exactly-one-entry guarantee still enforced and still provable.
- No spec text left contradicting the shipped UI.
- No orphaned copy keys, no dead props, no test asserting removed markup.

**Non-Goals**

- Rewording evaluation options or changing what any judgment means.
- Touching researcher surfaces, allocation, persistence, or exports.
- Redesigning the card beyond subtraction.

## Decisions

### D1 — Narrow `EntryCard` props, don't conditionally hide

**Chosen:** delete `originLabel`, `destinationLabel`, `transitModeLabel`,
`transitModeAbsent` from `EntryCardProps` and the endpoint `<dl>` from the
render, rather than a `showEndpoints` flag.

**Why.** A flag preserves a participant-facing code path that displays
research-internal endpoints; the requirement is that validators never see
them, so the capability should not exist in the component. The
typechecker then fails any caller still passing the props.

### D2 — Keep the identifier out of participant markup entirely

**Chosen:** delete the ID span; distinguish entries in tests by instruction
text.

**Why.** The ID's stated purpose was bug reports quoting it — researcher-side
review already matches rows without participant help, and the owner rules
the ID is researchers-only. The exactly-one-entry test is rewritten over the
instruction strings (each fixture entry carries a distinct one), so the guard
keeps measuring singularity rather than going quiet.

### D3 — The spec changes by REMOVED/ADDED pair, not by edit

**Chosen:** the present-one-entry requirement is recorded verbatim and
replaced.

**Why.** Its "sees a single entry with its origin and destination" scenario
cannot survive. A MODIFIED block dropping it would be refused; editing the
scenario in place would rewrite history. The pair keeps the old rule
readable and the new rule explicit.

### D4 — Landing voluntary proposition is kept, relocated by reference

**Chosen:** the landing card goes, with no replacement copy — the screening
notice already states voluntariness verbatim where the ethics rule requires
it (same screen as the question, above the submit).

**Why.** Duplicating an ethics proposition in two places means two places to
keep true. The deleted card's item 02 is additionally false under the current
methodology, so keeping any of it would ship a known lie.

## Risks / Trade-offs

- **["Incorrect" loses its stated yardstick.]** Accepted by the owner (see
  proposal); recorded here so a future reader does not "restore" endpoints
  as a fix.
- **[A future endpoint leak.]** Mitigation: props deleted, not hidden — any
  reintroduction is a type error plus a failing route test.
- **[Filipino mirrors.]** Deletions only; no new strings, so no translation risk.

## Migration Plan

None. No migration file is added or modified.

## Open Questions

None.
