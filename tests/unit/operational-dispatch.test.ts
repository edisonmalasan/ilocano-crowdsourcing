/**
 * The alert dispatch path: URL gating, aggregate-only POST, and failure semantics.
 *
 * `server-only` is stubbed like every other server-module suite: the marker throws outside a
 * React Server Component graph, so the stub is what lets the dispatch module run here at all.
 */
import { describe, expect, it, vi, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildAlertPayload,
  dispatchAlert,
  getOpsWebhookUrl,
  type OperationalAlertPayload,
} from "@/lib/ops/dispatch";

const PAYLOAD: OperationalAlertPayload = buildAlertPayload(
  "persistence_failed",
  new Date("2026-10-09T12:00:00.000Z"),
  5,
  5,
  new Date("2026-10-09T12:03:00.000Z"),
);

afterEach(() => {
  vi.useRealTimers();
});

describe("getOpsWebhookUrl", () => {
  it("returns a valid https URL, trimmed", () => {
    expect(getOpsWebhookUrl({ OPS_ALERT_WEBHOOK_URL: "https://hooks.example.com/ops  " })).toBe(
      "https://hooks.example.com/ops",
    );
  });

  it("returns null when the variable is missing, empty, blank, unparseable, or not http(s)", () => {
    expect(getOpsWebhookUrl({})).toBeNull();
    expect(getOpsWebhookUrl({ OPS_ALERT_WEBHOOK_URL: "" })).toBeNull();
    expect(getOpsWebhookUrl({ OPS_ALERT_WEBHOOK_URL: "   " })).toBeNull();
    expect(getOpsWebhookUrl({ OPS_ALERT_WEBHOOK_URL: "not a url" })).toBeNull();
    expect(getOpsWebhookUrl({ OPS_ALERT_WEBHOOK_URL: "ftp://hooks.example.com/ops" })).toBeNull();
    expect(getOpsWebhookUrl({ OPS_ALERT_WEBHOOK_URL: 42 })).toBeNull();
  });
});

describe("dispatchAlert", () => {
  it("POSTs the five-key aggregate payload as JSON and reports delivered on ok", async () => {
    const seen: { url: string; init: RequestInit | undefined }[] = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      seen.push({ url: String(url), init });
      return { ok: true } as Response;
    }) as typeof fetch;
    await expect(
      dispatchAlert(PAYLOAD, "https://hooks.example.com/ops", fetchImpl),
    ).resolves.toEqual({ delivered: true });
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe("https://hooks.example.com/ops");
    expect(seen[0].init?.method).toBe("POST");
    expect(seen[0].init?.headers).toMatchObject({
      "Content-Type": "application/json; charset=utf-8",
    });
    expect(Object.keys(JSON.parse(String(seen[0].init?.body))).sort()).toEqual([
      "count",
      "evaluatedAt",
      "rule",
      "threshold",
      "windowStart",
    ]);
  });

  it("reports undelivered on a non-ok status without throwing", async () => {
    const fetchImpl = (async () => ({ ok: false, status: 500 }) as Response) as typeof fetch;
    await expect(
      dispatchAlert(PAYLOAD, "https://hooks.example.com/ops", fetchImpl),
    ).resolves.toEqual({
      delivered: false,
    });
  });

  it("reports undelivered when fetch rejects, without throwing", async () => {
    const fetchImpl = (() => Promise.reject(new Error("refused"))) as unknown as typeof fetch;
    await expect(
      dispatchAlert(PAYLOAD, "https://hooks.example.com/ops", fetchImpl),
    ).resolves.toEqual({
      delivered: false,
    });
  });

  it("reports undelivered when fetch throws synchronously, without throwing", async () => {
    const fetchImpl = (() => {
      throw new Error("boom");
    }) as unknown as typeof fetch;
    await expect(
      dispatchAlert(PAYLOAD, "https://hooks.example.com/ops", fetchImpl),
    ).resolves.toEqual({
      delivered: false,
    });
  });

  it("reports undelivered on timeout, without waiting out the clock", async () => {
    vi.useFakeTimers();
    const hangingFetch = ((_url: string | URL | Request, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      })) as unknown as typeof fetch;
    const pending = dispatchAlert(PAYLOAD, "https://hooks.example.com/ops", hangingFetch);
    await vi.advanceTimersByTimeAsync(5000);
    await expect(pending).resolves.toEqual({ delivered: false });
  });
});
