# Specify the pending state and the onward route

## Why

Two behaviours that the public onboarding flow already implements — and that `thin-shell-call-sites`
added behavioural guards for — carry **no requirement anywhere in the nine in-force specs**. They were
identified while re-deriving that change's call-site list and recorded as a pre-existing spec gap in
`docs/ROADMAP.md` → `Active Blockers`.

This gap is worth closing now rather than during Phase 5, and for a specific reason rather than a
general one. **Phase 5 extends exactly these components.** It adds a conditional correction field and
two required research translations, both of which are handler-driven and both of which need a pending
state. Building those on top of unspecified behaviour means the next stage either extends an
unregulated pattern or invents its own and then retrofits a requirement to it. Specifying first means
the behaviour being extended is the behaviour that is specified.

## What Changes

Two existing capabilities gain a requirement each. **No product behaviour changes, and no file under
`src/` changes.**

1. **`design-system` — a control whose action is in flight exposes a pending state.** This is a
   primitive-level accessibility and clarity contract: such a control SHALL be inert, SHALL expose
   `aria-busy`, and SHALL report progress through text rather than through the disabled styling alone.
   The existing "Accessible interactive states" requirement already covers what a control does *while
   disabled*; nothing specifies *when a control becomes disabled*, which is why the gap exists.

2. **`validator-onboarding` — the onboarding flow is single-flight and ends at `/ready`.** While an
   enrollment or a resume is in flight, the flow's controls SHALL be inert, so a second write cannot
   be started; and a completed onboarding SHALL move the participant to `/ready`.

**This is a specification change and it deliberately carries spec deltas.** It is *not*
`skip_specs: true`. That flag was correct on `thin-shell-call-sites`, whose entire content was
behaviour that already existed and therefore warranted no delta; here the content *is* a delta.

### Why the second requirement is a research-integrity requirement and not a UX one

A second enrollment write is not merely an inconvenience. If it could start, a participant could be
persisted twice, which splits one person's research record across two anonymous identities with
nothing in the stored data able to tell them apart. The resume path is exposed to the same hazard from
the other side: a restore and a fresh enrollment racing each other would let an answer be attached to
an identity that is about to be replaced.

The specification currently has **no requirement** about either. It mandates that the *server* mints
the identifier, that client-supplied authoritative values are ignored, and that a second screening
answer is never stored — all of which are necessary and none of which prevent a duplicate write.

## Capabilities

**Modified** (both existing, both under their existing paths):

- `openspec/specs/design-system/spec.md` — **ADDED** requirement for the in-flight pending state.
- `openspec/specs/validator-onboarding/spec.md` — **ADDED** requirement for single-flight onboarding
  and the named onward route.

**New:** none. A new capability would be wrong here — both requirements are about existing
components, existing routes, and an existing flow, and inventing a capability to house them would
make the roadmap's capability list diverge from the product's shape for no gain.

## Impact

### What changes on disk

- `openspec/specs/design-system/spec.md` — one requirement and its scenarios, added.
- `openspec/specs/validator-onboarding/spec.md` — one requirement and its scenarios, added.
- This change's own artifacts, and `docs/ROADMAP.md`'s `## Project Status` at archive time.

**`git diff main --numstat -- src/ tests/ supabase/` is required to be empty for this change to be
what it claims to be.** That is a checkable property of the diff, not a promise in this document, and
the tasks list carries it as a task.

### What does NOT change

No runtime behaviour. No component is edited. No migration. No test. The behaviour being specified is
already implemented and already guarded:

| Behaviour | Where it lives | What already guards it |
| --- | --- | --- |
| Screening options inert during a write | `src/app/start/screening-form.tsx` (`disabled={isPending}` on the answer group) | `tests/dom/screening-form.test.tsx` |
| Screening submit + skip expose `disabled` and `aria-busy` and swap their label | same file, via `submitControlState` | `tests/dom/screening-form.test.tsx` |
| Resume continue button exposes `disabled` and `aria-busy` and swaps its label | `src/components/onboarding/resume-validator.tsx` | `tests/dom/resume-validator.test.tsx` |
| The flow ends at `/ready` | both components, on `decision.kind === "ready"` | `tests/unit/onboarding-routes.test.tsx` |

### The risk this change accepts, stated plainly

A specification-only change produces **no new behaviour and can fix nothing that is broken.** Its
entire value is that the next stage inherits requirements instead of inventing them, and that the
guard coverage added by `thin-shell-call-sites` is protecting behaviour the specs now describe. If
those two needs do not in fact apply, this change is churn and should be rejected as such.

Two narrower gaps are **not** closed here, and saying so is part of the proposal:

- **`RV-4`** — a *failed* resume must report rather than swallow — is still guarded only by a textual
  source scan. No DOM test covers `decision.kind === "error"`. The requirement this change adds will
  describe the pending state and not that error path, so the gap stays open.
- The **`Archived Changes` table in `docs/ROADMAP.md`** has no automated guard keeping it in step with
  `openspec/changes/archive/`, which was recorded rather than fixed during the last archive stage.

### What this change does not establish

It does not advance any verification. `happy-dom` is a synthetic DOM and **no human has ever rendered
any screen in this project**; PGlite is PostgreSQL compiled to WASM and **no Supabase credential
exists**, so Auth, Storage, Realtime, PostgREST, and RLS as enforced by the API gateway remain
unverified. Adding requirements to a capability whose runtime behaviour is unverifiable against a
real database is still correct — the pending state is client-side — but the claim stops at the
specification.