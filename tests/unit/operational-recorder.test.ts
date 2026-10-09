/**
 * The operational recorder: never breaks the research path, dispatches once per breach.
 *
 * `server-only` is stubbed like every other server-module suite in this project: the marker
 * throws outside a React Server Component graph, so the stub is what lets the recorder run
 * under Vitest at all.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildDedupeDigest } from "@/lib/ops/monitoring";
import { recordOperationalSignal, safeRecordOperationalSignal } from "@/lib/ops/recorder";
import type { OperationalEventsRepository } from "@/lib/repositories";

/** In-memory counter with the same dedupe and once-per-window semantics as the migration. */
function createFake() {
  const events: { signal: string; window: string; key: string | null }[] = [];
  const dispatches: { rule: string; window: string; count: number; threshold: number }[] = [];
  const recordEventArgs: { signal: string; windowStart: Date; dedupeKey?: string }[] = [];
  const calls = { pruneBefore: 0 };
  const repo: OperationalEventsRepository = {
    async recordEvent(signal, windowStart, dedupeKey) {
      recordEventArgs.push({ signal, windowStart, dedupeKey });
      const key = dedupeKey ?? null;
      const window = windowStart.toISOString();
      if (
        key !== null &&
        events.some(
          (event) => event.signal === signal && event.window === window && event.key === key,
        )
      ) {
        return;
      }
      events.push({ signal, window, key });
    },
    async countForWindow(signal, windowStart) {
      const window = windowStart.toISOString();
      return events.filter((event) => event.signal === signal && event.window === window).length;
    },
    async hasDispatch(rule, windowStart) {
      const window = windowStart.toISOString();
      return dispatches.some((row) => row.rule === rule && row.window === window);
    },
    async recordDispatch(rule, windowStart, count, threshold) {
      const window = windowStart.toISOString();
      if (dispatches.some((row) => row.rule === rule && row.window === window)) return false;
      dispatches.push({ rule, window, count, threshold });
      return true;
    },
    async pruneBefore() {
      calls.pruneBefore += 1;
    },
  };
  return { repo, events, dispatches, recordEventArgs, calls };
}

const AT = new Date("2026-10-09T12:03:00.000Z");
const now = () => new Date(AT.getTime());

function okFetch(captured: { url: string; body: unknown }[]) {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    captured.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return { ok: true } as Response;
  }) as typeof fetch;
}

describe("recordOperationalSignal", () => {
  it("is exported under the call-site alias, so the safe name is the same function", () => {
    expect(safeRecordOperationalSignal).toBe(recordOperationalSignal);
  });

  it("never throws when every repository call rejects, and logs instead", async () => {
    const failing: OperationalEventsRepository = {
      recordEvent: () => Promise.reject(new Error("down")),
      countForWindow: () => Promise.reject(new Error("down")),
      hasDispatch: () => Promise.reject(new Error("down")),
      recordDispatch: () => Promise.reject(new Error("down")),
      pruneBefore: () => Promise.reject(new Error("down")),
    };
    const logged: [string, unknown?][] = [];
    await expect(
      recordOperationalSignal(
        { events: failing, log: (message, error) => void logged.push([message, error]), now },
        "persistence_failed",
      ),
    ).resolves.toBeUndefined();
    expect(logged.length).toBeGreaterThan(0);
  });

  it("never throws when the POST throws, and still keeps the dispatch row", async () => {
    const { repo, dispatches } = createFake();
    // Pre-seed four occurrences so this increment is the breaching fifth.
    for (let index = 0; index < 4; index += 1) {
      await repo.recordEvent("persistence_failed", new Date("2026-10-09T12:00:00.000Z"));
    }
    const throwingFetch = (() => Promise.reject(new Error("refused"))) as unknown as typeof fetch;
    const logged: string[] = [];
    await expect(
      recordOperationalSignal(
        {
          events: repo,
          webhookUrl: "https://hooks.example.com/ops",
          dispatchFetch: throwingFetch,
          log: (message) => void logged.push(message),
          now,
        },
        "persistence_failed",
      ),
    ).resolves.toBeUndefined();
    expect(dispatches).toHaveLength(1);
    expect(logged.some((line) => line.includes("not delivered"))).toBe(true);
  });

  it("dispatches exactly once when two increments breach the same window", async () => {
    const { repo, events, dispatches } = createFake();
    // Pre-seed four occurrences: both increments below breach, and only the first may dispatch.
    for (let index = 0; index < 4; index += 1) {
      await repo.recordEvent("persistence_failed", new Date("2026-10-09T12:00:00.000Z"));
    }
    const captured: { url: string; body: unknown }[] = [];
    const deps = {
      events: repo,
      webhookUrl: "https://hooks.example.com/ops",
      dispatchFetch: okFetch(captured),
      log: () => {},
      now,
    };
    await recordOperationalSignal(deps, "persistence_failed");
    await recordOperationalSignal(deps, "persistence_failed");
    expect(events.filter((event) => event.signal === "persistence_failed")).toHaveLength(6);
    expect(dispatches).toHaveLength(1);
    expect(captured).toHaveLength(1);
  });

  it("posts nothing while the count stays below the threshold", async () => {
    const { repo, dispatches } = createFake();
    const captured: { url: string; body: unknown }[] = [];
    await recordOperationalSignal(
      {
        events: repo,
        webhookUrl: "https://hooks.example.com/ops",
        dispatchFetch: okFetch(captured),
        log: () => {},
        now,
      },
      "persistence_failed",
    );
    expect(dispatches).toHaveLength(0);
    expect(captured).toHaveLength(0);
  });

  it("forwards a truncated hex digest, never the raw material", async () => {
    const { repo, recordEventArgs } = createFake();
    const material = "batch-1:entry-2";
    await recordOperationalSignal(
      { events: repo, log: () => {}, now },
      "persistence_failed",
      material,
    );
    expect(recordEventArgs).toHaveLength(1);
    const [call] = recordEventArgs;
    expect(Object.keys(call).sort()).toEqual(["dedupeKey", "signal", "windowStart"]);
    expect(call.dedupeKey).toMatch(/^[0-9a-f]{16}$/);
    expect(call.dedupeKey).not.toBe(material);
    expect(call.dedupeKey).toBe(buildDedupeDigest("persistence_failed", material));
    expect(JSON.stringify(recordEventArgs)).not.toContain(material);
  });

  it("posts a payload with exactly the five aggregate keys", async () => {
    const { repo } = createFake();
    for (let index = 0; index < 4; index += 1) {
      await repo.recordEvent("persistence_failed", new Date("2026-10-09T12:00:00.000Z"));
    }
    const captured: { url: string; body: unknown }[] = [];
    await recordOperationalSignal(
      {
        events: repo,
        webhookUrl: "https://hooks.example.com/ops",
        dispatchFetch: okFetch(captured),
        log: () => {},
        now,
      },
      "persistence_failed",
    );
    expect(captured).toHaveLength(1);
    expect(Object.keys(captured[0].body as Record<string, unknown>).sort()).toEqual([
      "count",
      "evaluatedAt",
      "rule",
      "threshold",
      "windowStart",
    ]);
    expect(captured[0].body).toMatchObject({ rule: "persistence_failed", count: 5, threshold: 5 });
  });

  it("records keyless signals on every call without a digest", async () => {
    const { repo, recordEventArgs } = createFake();
    await recordOperationalSignal({ events: repo, log: () => {}, now }, "enroll_failed");
    await recordOperationalSignal({ events: repo, log: () => {}, now }, "enroll_failed");
    expect(recordEventArgs.map((call) => call.dedupeKey)).toEqual([undefined, undefined]);
    expect(await repo.countForWindow("enroll_failed", new Date("2026-10-09T12:00:00.000Z"))).toBe(
      2,
    );
  });
});
