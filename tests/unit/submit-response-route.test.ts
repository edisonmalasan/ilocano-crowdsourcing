/**
 * `POST /api/validation-responses`, driven with mocks — no credential, no database.
 *
 * `server-only` cannot run under Vitest so it is stubbed; the boundary it marks is asserted
 * structurally elsewhere. The environment and the repository seam are scripted fakes, but the
 * intent parsing is the REAL `runSubmitResponse` core: malformed bodies, smuggled ownership,
 * and the status-to-code mapping are the handler's own contract and are proven here.
 */
import { describe, expect, it, vi } from "vitest";

import { ServerEnvError } from "@/lib/env/server";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  envAvailable: true,
  submitCalls: [] as unknown[],
  submitScript: [] as Array<() => Promise<unknown>>,
}));

vi.mock("@/lib/env/server", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    // The real check reads real credentials; here "available" means "the check passes".
    // The repository seam is mocked below, so the returned value is never read.
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
    validations: {
      submitResponse: async (input: unknown) => {
        h.submitCalls.push(input);
        const next = h.submitScript.shift();
        if (next === undefined) throw new Error("POST with no scripted submit answer");
        return next();
      },
    },
  }),
}));

import { POST } from "@/app/api/validation-responses/route";

const BATCH_ID = "VAL_a81d92c1-2026-09-30T20:14:03.117Z";

function request(body: unknown): Request {
  return new Request("http://localhost/api/validation-responses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function validBody() {
  return {
    batchId: BATCH_ID,
    datasetEntryId: "OD_1",
    response: { evaluation: "correct_natural" },
  };
}

async function post(body: unknown): Promise<{ status: number; json: unknown }> {
  const response = await POST(request(body));
  return { status: response.status, json: await response.json() };
}

describe("POST /api/validation-responses", () => {
  it("persists through one RPC and answers 200 with the recorded verdict", async () => {
    h.envAvailable = true;
    h.submitCalls.length = 0;
    h.submitScript.length = 0;
    h.submitScript.push(async () => ({
      status: "recorded",
      responseId: "rsp_01",
      reservationReleased: true,
    }));

    const { status, json } = await post(validBody());

    expect(status).toBe(200);
    expect(json).toEqual({
      status: "recorded",
      responseId: "rsp_01",
      datasetEntryId: "OD_1",
    });
    // Exactly one RPC, and the browser's bytes never carried ownership: no validator id,
    // no response id, no timestamps in what the handler forwarded.
    expect(h.submitCalls).toHaveLength(1);
    expect(h.submitCalls[0]).toMatchObject({ batchId: BATCH_ID, datasetEntryId: "OD_1" });
    expect(h.submitCalls[0]).not.toHaveProperty("validatorId");
  });

  it("answers already_recorded with 200, so a lost acknowledgement is safe to retry", async () => {
    h.envAvailable = true;
    h.submitCalls.length = 0;
    h.submitScript.length = 0;
    h.submitScript.push(async () => ({
      status: "already_recorded",
      responseId: "rsp_earlier",
      reservationReleased: true,
    }));

    const { status, json } = await post(validBody());

    expect(status).toBe(200);
    expect(json).toEqual({ status: "already_recorded", datasetEntryId: "OD_1" });
  });

  it("refuses unparseable JSON with 400 before touching the database", async () => {
    h.envAvailable = true;
    h.submitCalls.length = 0;
    h.submitScript.length = 0;

    const { status, json } = await post("{not json");

    expect(status).toBe(400);
    expect(json).toEqual({ status: "failed", reason: "invalid" });
    expect(h.submitCalls).toHaveLength(0);
  });

  it("refuses a schema-invalid body with 400 before touching the database", async () => {
    h.envAvailable = true;
    h.submitCalls.length = 0;
    h.submitScript.length = 0;

    const { status, json } = await post({
      batchId: BATCH_ID,
      datasetEntryId: "OD_1",
      response: { evaluation: "incorrect" },
    });

    expect(status).toBe(400);
    expect((json as { reason?: string }).reason).toBe("invalid");
    expect(h.submitCalls).toHaveLength(0);
  });

  it("ignores a smuggled validator id: 400, nothing written", async () => {
    h.envAvailable = true;
    h.submitCalls.length = 0;
    h.submitScript.length = 0;

    const { status } = await post({ ...validBody(), validatorId: "VAL_ffffffff" });

    expect(status).toBe(400);
    expect(h.submitCalls).toHaveLength(0);
  });

  it("maps unknown_batch to 404 and not_in_batch to 422", async () => {
    h.envAvailable = true;
    for (const [reason, code] of [
      ["unknown_batch", 404],
      ["not_in_batch", 422],
    ] as const) {
      h.submitCalls.length = 0;
      h.submitScript.length = 0;
      h.submitScript.push(async () => ({ status: "refused", reason }));

      const { status, json } = await post(validBody());

      expect(status).toBe(code);
      expect(json).toEqual({ status: "failed", reason });
    }
  });

  it("answers 503 with no database configured, and writes nothing", async () => {
    h.envAvailable = false;
    h.submitCalls.length = 0;
    h.submitScript.length = 0;

    const { status, json } = await post(validBody());

    expect(status).toBe(503);
    expect(json).toEqual({ status: "failed", reason: "not_configured" });
    expect(h.submitCalls).toHaveLength(0);
    h.envAvailable = true;
  });

  it("answers 429 for a paced save with zero RPCs, so the client waits and retries", async () => {
    h.envAvailable = true;
    h.submitCalls.length = 0;
    h.submitScript.length = 0;

    // A batch id no other test uses: the route paces per batch capability, so
    // this burst measures exactly thirty allowed saves and one refusal without
    // sharing budget with the tests above.
    const pacedBatchId = "VAL_a81d92c1-2026-09-30T20:14:04.117Z";
    const pacedBody = () => ({ ...validBody(), batchId: pacedBatchId });

    // Thirty saves against one batch capability fit; the thirty-first is refused
    // before any RPC, and the route answers 429 — never 503, nothing is broken.
    for (let n = 0; n < 30; n += 1) {
      h.submitScript.push(async () => ({
        status: "recorded",
        responseId: `rsp_${n}`,
        reservationReleased: true,
      }));
    }
    for (let n = 0; n < 30; n += 1) {
      const { status } = await post(pacedBody());
      expect(status).toBe(200);
    }
    expect(h.submitCalls).toHaveLength(30);

    const refused = await post(pacedBody());
    expect(refused.status).toBe(429);
    expect(refused.json).toEqual({ status: "failed", reason: "throttled" });
    expect(h.submitCalls).toHaveLength(30);
  });

  it("never caches: the answer is private and unrepeatable", async () => {
    h.envAvailable = true;
    h.submitCalls.length = 0;
    h.submitScript.length = 0;
    h.submitScript.push(async () => ({
      status: "recorded",
      responseId: "rsp_01",
      reservationReleased: false,
    }));

    const response = await POST(request(validBody()));

    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });

  it("logs only status and duration: no response text reaches the operator log", async () => {
    // The 7.1 half at the transport: a POST carrying a distinctive correction and both
    // translations logs a line naming the verdict and a duration — and neither payload
    // string appears in anything the handler logged.
    h.envAvailable = true;
    h.submitCalls.length = 0;
    h.submitScript.length = 0;
    h.submitScript.push(async () => ({
      status: "recorded",
      responseId: "rsp_01",
      reservationReleased: true,
    }));
    const lines: string[] = [];
    const info = vi.spyOn(console, "info").mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    });
    try {
      const { status } = await post({
        batchId: BATCH_ID,
        datasetEntryId: "OD_1",
        response: {
          evaluation: "incorrect",
          correctedInstruction: "ZebraQuagga correction sentence",
          englishTranslation: "ZebraQuagga english sentence",
          filipinoTranslation: "ZebraQuagga filipino sentence",
        },
      });

      expect(status).toBe(200);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatch(/response POST status=recorded durationMs=\d+/);
      for (const line of lines) {
        expect(line).not.toContain("ZebraQuagga");
        expect(line).not.toContain(BATCH_ID);
      }
    } finally {
      info.mockRestore();
    }
  });
});
