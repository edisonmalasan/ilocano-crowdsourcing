import { createHash } from "node:crypto";

/**
 * ============================================================================
 * PUBLIC THROTTLE — per-action backstops for the unauthenticated surface
 * ============================================================================
 * `resume` (identifier present/absent?) and `session_open` (does this browser
 * hold this batch?) are both valid/invalid oracles taken at network speed:
 * every refusal is cheap, every answer is one bit, and nothing but pacing
 * separates a participant from a prober. `enroll`, `allocate`, and `submit`
 * are the same problem one layer up: each accepted call performs a database
 * write (one validator row, one allocation RPC, one submission RPC), so an
 * unpaced caller mints junk rows and burns reservations at machine speed.
 * This module paces all five.
 *
 * WHAT IT IS AND IS NOT. It is a RATE LIMIT, not an authorization control.
 * The authorization decision is the stored-owner comparison in
 * `openOwnedValidationSession` and the identifier lookup in `resumeValidator`;
 * nothing here participates in either. Throttling only bounds how fast those
 * answers can be collected. See `@/lib/admin/origin` for the same distinction
 * on the researcher side, and the honest limitation recorded there about
 * forwarded headers: on a deployment that does not strip `x-forwarded-for`
 * a party can choose its own origin component, so the per-actor component
 * is what still binds a guessing run to one budget per guessed identity.
 *
 * ============================================================================
 * NO IDENTITY IN, NO IDENTITY OUT
 * ============================================================================
 * Both key components are hashed with SHA-256 the moment they arrive, and
 * only the digests ever reach the in-memory table. The raw header value and
 * the raw attempt identifier are never stored, never logged, never written
 * to a research table, and never exported. The table itself is process
 * memory with a bounded TTL: entries whose window has fully expired are
 * dropped on the next check, so a key cannot outlive its window.
 *
 * The SINGLE-INSTANCE limit, stated rather than hidden: this is process
 * memory, so two server instances hold two tables. On a multi-instance
 * deployment a prober gets one allowance per instance rather than one
 * globally. That is acceptable for a backstop whose authorization decision
 * lives elsewhere, and the alternative — a durable counter — would put
 * request-origin data in the research database, which the spec forbids.
 * (`researcher-signin` keeps its counter durable because that origin key is
 * coarse and non-identifying BY DESIGN there; here it is hashed AND
 * memory-only.)
 *
 * ============================================================================
 * THRESHOLDS — generous humans, not the UI skeleton
 * ============================================================================
 * Set from measured human-scale 5-entry-batch behavior, not from the UI's
 * internal timings (bots call endpoints directly, so skeleton timings would
 * only throttle the honest client). A resume happens about once per visit;
 * a session open about once per page load plus retries. Campus Wi-Fi, NAT,
 * and shared households put many humans behind one origin, so the
 * per-origin allowance is a multiple of the per-actor one: one noisy
 * household must not starve itself, and one prober must still slow down.
 * These are OPERATIONAL values, pending production observation — raising or
 * lowering them changes no schema, no export, and no research semantics.
 */
export type PublicThrottleAction = "resume" | "session_open" | "enroll" | "allocate" | "submit";

interface ThrottleBucketSpec {
  /** How many allowed checks fit in one window. */
  readonly limit: number;
  /** Window length, in seconds. */
  readonly windowSeconds: number;
}

interface ActionThrottleSpec {
  readonly origin: ThrottleBucketSpec;
  /**
   * The per-actor bucket, absent when the action has no actor to scope to.
   * The actor is whatever unguessable client-supplied value names the caller:
   * the attempt identifier for `resume`/`session_open`/`allocate`, the batch
   * capability for `submit`. `enroll` has none — no identity exists yet —
   * so it carries an origin bucket only.
   */
  readonly actor?: ThrottleBucketSpec;
}

const ACTION_THROTTLE_SPEC: Record<PublicThrottleAction, ActionThrottleSpec> = {
  // A human resumes about once per visit; thirty attempts per five minutes
  // per identity and sixty per origin per five minutes never binds one,
  // while a prober sweeping identifiers exhausts the origin bucket in a
  // minute and then waits out the window for every further guess.
  resume: {
    origin: { limit: 60, windowSeconds: 300 },
    actor: { limit: 30, windowSeconds: 300 },
  },
  // A session open happens once per page load, plus refreshes and retries.
  // Generous by a factor no human reaches by refreshing: one hundred twenty
  // per identity and three hundred per origin per five minutes.
  session_open: {
    origin: { limit: 300, windowSeconds: 300 },
    actor: { limit: 120, windowSeconds: 300 },
  },
  // Enrollment mints one validator row per accepted call and happens once per
  // browser session for a human. Thirty per origin per five minutes admits a
  // classroom behind one NAT while stopping a script minting junk rows.
  enroll: {
    origin: { limit: 30, windowSeconds: 300 },
  },
  // One allocation RPC plus reads per accepted call, about once per batch
  // (minutes of answering) for a human. Mirrors the `resume` shape: sixty
  // per origin and twenty per attempt per five minutes.
  allocate: {
    origin: { limit: 60, windowSeconds: 300 },
    actor: { limit: 20, windowSeconds: 300 },
  },
  // Five saves per batch plus retries and already-recorded replays per human.
  // Thirty per batch capability and three hundred per origin per five minutes
  // admit a NAT classroom submitting concurrently while stopping a flood.
  submit: {
    origin: { limit: 300, windowSeconds: 300 },
    actor: { limit: 30, windowSeconds: 300 },
  },
};

/** The bucket every check with no usable origin signal shares. */
export const PUBLIC_THROTTLE_NO_ORIGIN = "no-origin-signal";

/**
 * The narrow capability the gated paths need: one predicate, no state
 * handle, no counts. A caller that can only ask "may this check proceed"
 * cannot read how full a bucket is, which is what keeps the throttle from
 * becoming a second oracle for "am I being limited right now".
 */
export interface PublicThrottle {
  /**
   * True when the check may proceed. An allowed check CONSUMES one unit from
   * the origin bucket and, where the action has one, from the actor bucket; a
   * refused one consumes nothing, so refusal never extends its own window.
   *
   * `actorRaw` is the unguessable client-supplied value naming the caller
   * (attempt identifier, or batch capability for `submit`), hashed inside
   * like every other key component. Actions without an actor bucket ignore
   * it; callers of those actions pass none.
   */
  check(action: PublicThrottleAction, originRaw: string, actorRaw?: string): boolean;
}

/** SHA-256 hex of one raw key component. Raw values never reach the table. */
function hashedComponent(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

function bucketKey(action: PublicThrottleAction, scope: "origin" | "actor", raw: string): string {
  return `${action}:${scope}:${hashedComponent(raw)}`;
}

/**
 * Builds a throttle over an injected clock, so every window edge is
 * assertable without waiting out a real five minutes.
 *
 * `nowMs` defaults to the real clock for production; tests pass a manual
 * one. The store is created per instance and never shared between them,
 * which is also what keeps one test's bursts out of another's.
 */
export function createPublicThrottle(nowMs: () => number = () => Date.now()): PublicThrottle {
  const hits = new Map<string, number[]>();

  function recent(key: string, windowMs: number, now: number): number[] {
    const kept = (hits.get(key) ?? []).filter((at) => now - at < windowMs);
    if (kept.length === 0) hits.delete(key);
    else hits.set(key, kept);
    return kept;
  }

  return {
    check(action, originRaw, actorRaw): boolean {
      const spec = ACTION_THROTTLE_SPEC[action];
      const now = nowMs();
      const originKey = bucketKey(action, "origin", originRaw);
      const originWindowMs = spec.origin.windowSeconds * 1000;

      const originHits = recent(originKey, originWindowMs, now);
      if (originHits.length >= spec.origin.limit) return false;

      let actorHits: number[] | null = null;
      let actorKey = "";
      if (spec.actor !== undefined) {
        // An action WITH an actor bucket and no actor value supplied is a
        // caller bug, not a free pass: refusing closed keeps an unwired call
        // site from pacing nothing while appearing paced.
        if (actorRaw === undefined) return false;
        actorKey = bucketKey(action, "actor", actorRaw);
        const actorWindowMs = spec.actor.windowSeconds * 1000;
        actorHits = recent(actorKey, actorWindowMs, now);
        if (actorHits.length >= spec.actor.limit) return false;
      }

      originHits.push(now);
      hits.set(originKey, originHits);
      if (actorHits !== null) {
        actorHits.push(now);
        hits.set(actorKey, actorHits);
      }
      return true;
    },
  };
}

/**
 * The instance the Server Actions share.
 *
 * Module scope is the whole point: one table per server instance, so
 * bursts are accounted across requests rather than per request. Nothing
 * about research correctness depends on it — the ownership comparison
 * does — so a cold start that empties the table only resets pacing.
 */
export const sharedPublicThrottle: PublicThrottle = createPublicThrottle();
