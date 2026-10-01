# Why

Roadmap Phase 6 asks for a continuous voluntary crowdsourcing loop: batch complete, contribution
count, `Validate 10 More`, `Finish For Now`, a new batch when continuing, and interrupted-batch
restoration.

The loop currently dead-ends at exactly the moment it is supposed to become continuous. The finished
state **exists and is rendered** — `session.ts` derives it, `session-service.ts` returns it,
`page.tsx` renders it — but it carries no figures and **no affordances at all**. Its own copy says so:

> "You have answered every sentence in this batch. Each one was saved as you went. Asking for another
> batch is not part of this part of the study yet."

Every participant who finishes a batch therefore reaches a dead end with no way to continue and no way
to stop deliberately. The machinery for continuing already exists and works; it is simply not
reachable from where the participant is standing.

## What

Give the finished batch a real presentation: two server-derived figures, exactly one control that
continues by requesting a new batch from the server, and a separate control that stops without
discarding anything.

## Scope

**In:** roadmap tasks 1–5 — batch-complete state, contribution count, `Validate 10 More`,
`Finish For Now`, new batch on continue.

**Deliberately out:** roadmap task 6, *restore interrupted active batches where practical*. It is a
separate vertical slice with a different blast radius, and the reason is recorded under
[Deliberately not in this change](#deliberately-not-in-this-change).

This change adds **one capability, `batch-completion`, and modifies zero.** That is a claim, not an
assumption, and it was checked three ways:

- `openspec/specs/` was searched for anything specifying or forbidding a finished screen, continuation,
  a contribution count, or "another batch". **Nothing.** The only hit was `design-system` on terminal
  framing, which is unrelated.
- `validation-experience` specifies *when* a response is persisted and that the session advances. It
  never specifies the finished presentation, so this change adds a capability rather than modifying
  one.
- `interface-localization` already requires localization to cover "the continue and finish controls".
  This change **satisfies** an in-force requirement by supplying those controls; it does not change the
  requirement.

## Why not simply add a batch status column

It is the obvious move and it would be wrong here. `research-schema` currently requires that batch
status, completion timestamps, and assignment timestamps "remain undefined until the changes that own
them add them". Adding a `status` column would therefore modify `research-schema` and require a
migration — for a state the system can already derive exactly.

The finished state is already derived correctly, and the derivation is deliberate: it comes from the
**absence of unanswered entries**, never from a stored flag. A stored status would be a second
authority that can disagree with the entries, and this project has a documented allergy to exactly
that shape. `validation_batches` carries two columns and no timestamps, by choice, with the reason
written into the migration. This change leaves it that way, and the requirement says so explicitly so
that the next change is not misled into thinking the groundwork was laid here.

## Why now

Phase 5 is in force and archived. `validation-experience` guarantees a response is banked
immediately, so a participant who abandons a batch loses no work — which is the property that makes
continuation safe to offer. Adding continuation before that guarantee existed would have meant
encouraging a loop whose progress was not yet durable.
