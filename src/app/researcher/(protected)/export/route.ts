import { getAdminEnv } from "@/lib/admin/env";
import { serverNowMs } from "@/lib/admin/clock";
import { readResearcherSessionCookie } from "@/lib/admin/cookie";
import { buildResearchDownload } from "@/lib/export/web-download";
import { createSupabaseRepositories } from "@/lib/repositories/supabase";

/**
 * The researcher export download: `GET /researcher/export`.
 *
 * THIN ON PURPOSE. Authorization, collection, derivation, and packaging all live in
 * `buildResearchDownload`, which is unit-tested with fakes; this handler supplies the real
 * cookie value, environment, clock, repositories, and logger, then translates the verdict
 * into a response. There is deliberately no layout check to lean on — layouts do not run
 * for Route Handlers — so the core verifies the session itself before any privileged read.
 */
export async function GET(): Promise<Response> {
  const { datasetEntries, validations, validators } = createSupabaseRepositories();
  const verdict = await buildResearchDownload({
    presented: await readResearcherSessionCookie(),
    adminEnv: getAdminEnv(),
    nowMs: serverNowMs(),
    repositories: { entries: datasetEntries, validations, validators },
    log: (line) => console.info(`[sadino:research-export] ${line}`),
  });

  if (verdict.status === "refused") {
    return new Response(verdict.message, {
      status: 403,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  if (verdict.status === "too_large") {
    return new Response(
      "The research export exceeds the downloadable size. Run the operator command instead.",
      { status: 413, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }

  return new Response(new Blob([verdict.body], { type: "application/zip" }), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${verdict.filename}"`,
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}
