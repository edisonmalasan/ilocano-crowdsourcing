# Design

## Context

See proposal.md - Why. Current state: the researcher area authorizes pages through the `(protected)` layout (`resolveResearcherAccess` over the signed session cookie; layouts do not wrap Route Handlers, so a download route must verify on its own). The export builds five documents through `renderDocuments` over `ExportSources` read-only picks. No Route Handler precedent exists; no ZIP library is installed; test files enumerate group membership, `getAdminEnv` readers, and route witnesses in closed sets.

## Goals / Non-Goals

**Goals:**

- One authenticated download reusing the existing builders with byte-equivalence to the CLI artifacts.
- Explicit per-request verification; credentials never leave the server.
- Closed test enumerations extended honestly, not weakened.

**Non-Goals:**

- Streaming/chunked ZIP (corpus fits memory; a stated bound with refusal instead).
- Audit persistence (log line only; no new table).
- Dashboard redesign (refinement within the incumbent idiom only).

## Decisions

**D1: Route Handler at `src/app/researcher/(protected)/export/route.ts` with its own guard call, not reliance on the layout.**

The layout cannot authorize a file response — layouts do not run for Route Handlers. The handler calls `resolveResearcherAccess` with the presented cookie + `getAdminEnv()` + server clock first, and returns 403 with `RESEARCHER_REFUSAL_MESSAGE` before any repository is constructed. Alternative (middleware) rejected: middleware cannot `import "server-only"`, per the layout's documented D6.

**D2: Thin handler over an injectable core (`src/lib/export/web-download.ts`), mirroring `validation-actions-core`.**

The core takes `{ presented, adminEnv, nowMs, repositories, clock }` and returns either a refusal or the five document strings plus filename. Unit tests drive it with fakes (no `server-only` import in core; the handler supplies real repositories). The handler is ~20 lines: verify, collect, render, zip, respond. Alternative (logic inline in `route.ts`) rejected: untestable without a network, and this repo's boundary rule keeps `server-only` out of network-reachable test scope.

**D3: `fflate` synchronous ZIP (`zipSync`), in-memory.**

Zero dependencies, ~8KB, sync API suits a Route Handler. Corpus today: 600 entries + a handful of validations (ZIP in KBs). A documented `MAX_EXPORT_BYTES` bound refuses rather than truncating if the corpus ever outgrows memory; streaming (`fflate` Zip stream + `ReadableStream`) is the recorded follow-up, not this change. Alternative (hand-rolled stored ZIP) rejected: CRC32 + headers by hand is exactly the unverifiable cleverness this repo refuses. Alternative (jszip) rejected: heavier, async API buys nothing here.

**D4: Dated filename from the server clock (`sadino-research-export-YYYY-MM-DD.zip`), `Content-Disposition: attachment`, `Content-Type: application/zip`, `Cache-Control: private, no-store` (inherited from the existing `/researcher/:path*` headers).**

**D5: Equivalence by construction + assertion, not by code review.**

Both paths call `renderDocuments`/`collectExportSources`. A test runs both over the same in-memory fakes and asserts the five web documents equal the five CLI documents byte-for-byte. The ZIP entry set is asserted closed (exactly the five names).

**D6: Audit is one server log line per served export: timestamp, session ordinal (not a secret), entry/response/validated counts.**

No new table, no error-monitoring dependency. Refused requests log nothing corpus-derived.

**D7: Dashboard gets an export section (link-button GET to the route) plus bounded visual refinement.**

A plain anchor (zero JS, matching the overview's link-only idiom) with `download` semantics via `Content-Disposition`. Refinement keeps every figure, copy meaning, and route; it adjusts hierarchy/spacing within soft neo-brutalism. No new copy keys (reuses existing catalog where possible; export labels are researcher-area English, outside the validator catalog by existing rule).

**D8: Closed test sets are extended, never loosened.**

`getAdminEnv` readers gains the route file; route witnesses gain the export route; dashboard-read-only scan covers the new files (read-only by construction: no write calls, no `"use server"`).

## Risks / Trade-offs

- [Risk] Corpus growth makes in-memory ZIP slow or oversized → Mitigation: `MAX_EXPORT_BYTES` bound with explicit refusal; streaming recorded as the follow-up.
- [Risk] Vercel function duration on large corpora → Mitigation: same bound; current corpus exports in milliseconds locally.
- [Risk] Route Handler bypasses layout guard by framework design → Mitigation: explicit verification is a spec requirement with a dedicated refusal-before-read test, plus a source test that the handler names the guard.
- [Risk] New dependency widens supply chain → Mitigation: `fflate` is zero-dependency, pinned in `pnpm-lock.yaml`, used only on the server export path.

## Migration Plan

No migration. Deploy normally; unconfigured deployments refuse the download exactly as they refuse the dashboard.
