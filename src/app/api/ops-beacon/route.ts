import { getServerEnv } from "@/lib/env/server";
import { parseBeaconId } from "@/lib/ops/beacon";
import { getOpsWebhookUrl } from "@/lib/ops/dispatch";
import { safeRecordOperationalSignal } from "@/lib/ops/recorder";
import { createSupabaseRepositories } from "@/lib/repositories/supabase";

/**
 * The client retry-exhaustion beacon: `POST /api/ops-beacon`.
 *
 * THIN ON PURPOSE. The browser's save queue POSTs `{ beaconId }` when it gives up retrying a
 * response write; the id is a random nonce that identifies the retry episode to NOBODY — it is
 * validated for shape alone and the recorder stores at most a digest of it, never the id.
 *
 * Best-effort in both directions: an invalid shape is a 400 with a generic body, a recorder
 * failure is absorbed (the recorder itself never throws), and no response body ever echoes the
 * submitted id.
 */
export async function POST(request: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ status: "invalid" }, 400);
  }
  const beaconId =
    typeof raw === "object" && raw !== null
      ? parseBeaconId((raw as Record<string, unknown>).beaconId)
      : null;
  if (beaconId === null) return json({ status: "invalid" }, 400);

  try {
    getServerEnv();
    const { operationalEvents } = createSupabaseRepositories();
    await safeRecordOperationalSignal(
      {
        events: operationalEvents,
        webhookUrl: getOpsWebhookUrl(),
        log: (message, error) => console.error(`[sadino:ops] ${message}`, error),
      },
      "retry_exhausted",
      beaconId,
    );
  } catch (error) {
    // The beacon is diagnostic: a deployment with no database, or any failure building the
    // recorder's dependencies, degrades to the existing log rather than a 500.
    console.error("[sadino:ops] retry-exhaustion beacon was not recorded", error);
  }
  return json({ status: "recorded" }, 200);
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}
