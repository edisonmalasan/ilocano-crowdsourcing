import type { Metadata } from "next";

/**
 * The `/researcher` segment shell.
 *
 * It carries the `noindex` declaration and NOTHING else — no guard, no session read, no database.
 *
 * The absence of a guard here is deliberate and is the reason this file exists at all. The guarded
 * layout is one level down in the `(protected)` route group, because the sign-in page has to be
 * reachable by a request that has NO session; a guard here would refuse the only page through which
 * a session can be obtained, and the researcher area would be unreachable rather than merely
 * protected.
 *
 * What lives here instead is the property that applies to the WHOLE area regardless of session:
 * this area is never indexed. Declared once, at the segment root, so a new researcher route cannot
 * be indexed by someone forgetting to add `metadata` to it — the same protected-by-omission argument
 * the guarded layout makes about authorization.
 */
export const metadata: Metadata = {
  title: "Researcher area",
  robots: { index: false, follow: false, nocache: true },
};

export default function ResearcherSegmentLayout({ children }: { children: React.ReactNode }) {
  return children;
}
