import "server-only";

import {
  POSTGREST_UNIQUE_VIOLATION_CODE,
  type OperationalEventsRepository,
} from "@/lib/repositories";

import type { SupabaseClientLike } from "./client";
import { awaitQuery, expectNoError, persistenceFailure, readExactCount, readRows } from "./rows";
import { OPERATIONAL_OPERATIONS as OPS } from "./operations";

/**
 * Supabase-backed durable operational counters.
 *
 * The client is the narrow {@link SupabaseClientLike}, so this is testable with a recording fake
 * and no network. Every method names an explicit column list, never `*`, per the seam's rule.
 *
 * DEDUPE WITHOUT `ON CONFLICT`
 * ---------------------------
 * PostgREST exposes no `ON CONFLICT` clause through the table builder this directory is written
 * against (`upsert` is deliberately absent from the narrow client), so a keyed occurrence is
 * recorded as read-then-insert: select for an existing row with the same (signal, window, key)
 * and skip the insert when one is present. Two concurrent recorders can both read "absent" and
 * both insert; the partial unique index arbitrates, and the loser's `23505` is swallowed here
 * rather than raised, because "already recorded" is the answer, not a failure.
 */
export class SupabaseOperationalEventsRepository implements OperationalEventsRepository {
  private readonly client: SupabaseClientLike;

  constructor(client: SupabaseClientLike) {
    this.client = client;
  }

  async recordEvent(signal: string, windowStart: Date, dedupeKey?: string): Promise<void> {
    const windowIso = windowStart.toISOString();
    if (dedupeKey !== undefined) {
      const existing = await awaitQuery(OPS.recordEvent, "operational_events.record", () =>
        this.client
          .from("operational_events")
          .select("id")
          .eq("signal", signal)
          .eq("window_start", windowIso)
          .eq("dedupe_key", dedupeKey)
          .limit(1),
      );
      if (readRows(existing, OPS.recordEvent, "operational_events.record").length > 0) return;
    }
    const result = await awaitQuery(OPS.recordEvent, "operational_events.record", () =>
      this.client.from("operational_events").insert({
        signal,
        window_start: windowIso,
        dedupe_key: dedupeKey ?? null,
      }),
    );
    if (result.error !== null) {
      // Lost the read-then-insert race described above: the row exists, which is the outcome
      // a retried request asks for. Any other refusal is a real failure and is raised.
      if (result.error.code === POSTGREST_UNIQUE_VIOLATION_CODE) return;
      throw persistenceFailure(OPS.recordEvent, "operational_events.record", result.error);
    }
  }

  async countForWindow(signal: string, windowStart: Date): Promise<number> {
    const windowIso = windowStart.toISOString();
    const result = await awaitQuery(OPS.countForWindow, "operational_events.count", () =>
      this.client
        .from("operational_events")
        .select("id", { count: "exact" })
        .eq("signal", signal)
        .eq("window_start", windowIso)
        .limit(1),
    );
    // The count is read from the envelope rather than from the rows: the rows are capped at one
    // on purpose (only the total is needed), so `rows.length` would report at most one.
    return readExactCount(result, OPS.countForWindow, "operational_events.count");
  }

  async hasDispatch(rule: string, windowStart: Date): Promise<boolean> {
    const windowIso = windowStart.toISOString();
    const result = await awaitQuery(OPS.hasDispatch, "operational_alerts.has", () =>
      this.client
        .from("operational_alerts")
        .select("id")
        .eq("rule", rule)
        .eq("window_start", windowIso)
        .limit(1),
    );
    return readRows(result, OPS.hasDispatch, "operational_alerts.has").length > 0;
  }

  async recordDispatch(
    rule: string,
    windowStart: Date,
    count: number,
    threshold: number,
  ): Promise<boolean> {
    const result = await awaitQuery(OPS.recordDispatch, "operational_alerts.record", () =>
      this.client.from("operational_alerts").insert({
        rule,
        window_start: windowStart.toISOString(),
        event_count: count,
        threshold,
      }),
    );
    if (result.error !== null) {
      // A concurrent recorder won this window: the unique (rule, window) pair arbitrated, and
      // "already dispatched" is the answer, not a failure. Any other refusal is raised.
      if (result.error.code === POSTGREST_UNIQUE_VIOLATION_CODE) return false;
      throw persistenceFailure(OPS.recordDispatch, "operational_alerts.record", result.error);
    }
    return true;
  }

  async pruneBefore(before: Date): Promise<void> {
    const handle = this.client.from("operational_events");
    // `delete` and `lt` are optional members of the narrow client: no other repository needs
    // them, so they are not required of every fake. When the client cannot express the cleanup
    // there is nothing to run, and retention stays bounded by the next caller that can.
    if (handle.delete === undefined) return;
    const pending = handle.delete();
    const lt = pending.lt;
    if (lt === undefined) return;
    const result = await awaitQuery(OPS.pruneBefore, "operational_events.prune", () =>
      lt.call(pending, "created_at", before.toISOString()),
    );
    expectNoError(result, OPS.pruneBefore, "operational_events.prune");
  }
}
