/**
 * `POST /api/ops-beacon`, driven with mocks — no credential, no database.
 *
 * The route is the only server entry to the `retry_exhausted` signal from the browser, so
 * its contract is pinned here: a well-shaped nonce is recorded as a digest (never the raw
 * id), a malformed body is a generic 400, no response ever echoes the submitted id, and a
 * recorder or environment failure still answers 200 because the beacon is diagnostic.
 */
import { describe, expect, it, vi } from "vitest";

import { ServerEnvError } from "@/lib/env/server";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  envAvailable: true,
  recordCalls: [] as Array<{ signal: string; windowStart: Date; dedupeKey?: string }>,
  failRecord: false,
}));

vi.mock("@/lib/env/server", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    getServerEnv: () => {
      if (!h.envAvailable) {
        throw new ServerEnvError(["SUPABASE_URL (withheld by test)"]);
      }
      return {};
    },
  };
});

vi.mock("@/lib/repositories/supabase", () => ({
  createSupabaseRepositories: () => ({
    operationalEvents: {
      recordEvent: async (signal: string, windowStart: Date, dedupeKey?: string) => {
        if (h.failRecord) throw new Error("counter down");
        h.recordCalls.push({ signal, windowStart, dedupeKey });
      },
      countForWindow: async () => 0,
      hasDispatch: async () => false,
      recordDispatch: async () => false,
      pruneBefore: async () => {},
    },
  }),
}));

vi.mock("@/lib/ops/dispatch", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return { ...original, getOpsWebhookUrl: () => null };
});

import { POST } from "@/app/api/ops-beacon/route";

const BEACON_ID = "AbCdefGHIJklmnOPqrstuv";

function request(body: unknown): Request {
  return new Request("http://localhost/api/ops-beacon", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function post(body: unknown): Promise<{ status: number; json: unknown; text: string }> {
  const response = await POST(request(body));
  const text = await response.text();
  return { status: response.status, json: JSON.parse(text) as unknown, text };
}

function reset() {
  h.envAvailable = true;
  h.failRecord = false;
  h.recordCalls.length = 0;
}

describe("POST /api/ops-beacon", () => {
  it("records a well-shaped nonce as a digest and answers 200 without echoing it", async () => {
    reset();
    const { status, json, text } = await post({ beaconId: BEACON_ID });

    expect(status).toBe(200);
    expect(json).toEqual({ status: "recorded" });
    expect(text).not.toContain(BEACON_ID);
    expect(h.recordCalls).toHaveLength(1);
    const call = h.recordCalls[0] as { signal: string; windowStart: Date; dedupeKey?: string };
    expect(call.signal).toBe("retry_exhausted");
    expect(call.windowStart).toBeInstanceOf(Date);
    // Digest-only: 16 hex chars, and provably not the raw nonce.
    expect(call.dedupeKey).toMatch(/^[0-9a-f]{16}$/);
    expect(call.dedupeKey).not.toBe(BEACON_ID);
  });

  it("answers a generic 400 for every malformed shape, recording nothing", async () => {
    reset();
    for (const body of [
      { beaconId: "short" },
      { beaconId: "has spaces in it !!!!!" },
      { beaconId: 42 },
      { beaconId: null },
      {},
      "not-json{{{",
    ]) {
      const { status, json, text } = await post(body);
      expect(status).toBe(400);
      expect(json).toEqual({ status: "invalid" });
      expect(text).not.toContain(BEACON_ID);
    }
    expect(h.recordCalls).toHaveLength(0);
  });

  it("still answers 200 when the recorder fails, because the beacon is diagnostic", async () => {
    reset();
    h.failRecord = true;
    const { status, json } = await post({ beaconId: BEACON_ID });
    expect(status).toBe(200);
    expect(json).toEqual({ status: "recorded" });
  });

  it("still answers 200 with no database configured, rather than a 500", async () => {
    reset();
    h.envAvailable = false;
    const { status, json } = await post({ beaconId: BEACON_ID });
    expect(status).toBe(200);
    expect(json).toEqual({ status: "recorded" });
    expect(h.recordCalls).toHaveLength(0);
  });
});
