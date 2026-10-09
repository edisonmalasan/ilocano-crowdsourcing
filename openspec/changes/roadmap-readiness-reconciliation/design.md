# Design

## Context

See proposal.md (Why). The ledger files are hand-maintained prose with one automated guard (`tests/unit/ledger-integrity.test.ts`, which covers only the archive count sentence and the Archived Changes table). Every other figure is maintained by convention: re-derive from the instrument, never inherit from the previous row.

## Goals / Non-Goals

**Goals:** every figure in the two ledger files re-measured at the Apply tip; audit-trail sentences preserved (prior records kept as history); deployment facts separated from code facts.

**Non-Goals:** changing any figure's meaning, reformatting either file, touching product code, configuring the webhook, applying migrations to the hosted project.

## Decisions

- **D1 — Re-derive, do not inherit.** Each replacement value is read off its instrument (CI log, `git log`, `openspec validate`, live HEAD response) at Apply time. Alternatives considered: carrying the Propose-stage values forward — rejected, because CI figures move with every merged test file.
- **D2 — Audit trail preserved.** The `AGENTS.md` rows keep their "prior record" convention: the stale sentence becomes a dated prior record, the measured figure becomes the head. Alternatives considered: rewriting the rows clean — rejected, because the convention is the only history of what each figure meant when it was written.
- **D3 — Read-only deployment evidence.** Hosted-table presence is checked with service-role GETs only; production headers with HEAD only. No POST, no migration apply, no webhook configuration. Alternatives considered: applying the missing migration or setting the webhook to reach READY — rejected, because deployment actions are operator decisions with research-data implications, not ledger repairs. If the checks find gaps, the verdict is NOT READY with the gaps named.
- **D4 — Verdict lives in the ledger, evidence lives in tasks.** `tasks.md` carries every measurement (run ids, SHAs, header bytes); `ROADMAP.md` carries the verdict plus pointers. Alternatives considered: verdict in a new spec capability — rejected, readiness is a project-management claim, not product behavior, and `skip_specs` is set.

## Risks / Trade-offs

- [Risk] A figure measured at Apply goes stale if another change merges first → Mitigation: the Apply re-measures everything on its own tip immediately before opening the PR, and the PR description names the tip SHA.
- [Risk] The hosted read-only check needs credentials present in `.env.local` → Mitigation: if credentials are absent or the check fails for any reason, record UNVERIFIED rather than guessing; an unverified deployment fact blocks READY the same way a negative one does.
