import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    /**
     * Required by `forbidden()`, the function the researcher-area guard uses to refuse a request.
     *
     * `forbidden()` throws a `NEXT_HTTP_ERROR_FALLBACK;403`, which renders this segment's
     * `forbidden.tsx` and returns a real 403 status — not a 200 carrying refusal text. That
     * distinction is the reason for using it rather than rendering a refusal page by hand: an
     * operator reading a request log can tell "refused" from "served" without parsing a body, and a
     * client-side router cannot mistake the refusal for content it should cache.
     *
     * It is experimental in 16.3.6 (introduced in 15.1.0) and it is used in exactly one place,
     * `@/lib/admin/guard`'s caller in `src/app/researcher/(protected)/layout.tsx`. Removing the flag
     * turns that refusal into a build-time error rather than a silent downgrade, which is the
     * outcome worth having.
     */
    authInterrupts: true,
  },

  /**
   * Cache-hostile and unindexed headers for the researcher area.
   *
   * Declared HERE rather than set per-response, and the reason is that the requirement covers the
   * REFUSAL as well as the served page. A Server Component cannot set a response header in this
   * router version, so a refusal produced by `forbidden()` would carry whatever the platform
   * defaults to.
   *
   * =================================================================================================
   * MEASURED 2026-10-02: `X-Robots-Tag` APPLIES, `Cache-Control` DOES NOT
   * =================================================================================================
   * Both headers are declared in the SAME block below, and a real request to a running server
   * returns `X-Robots-Tag: noindex, nofollow` — so the block matches the path and is not the problem.
   * The same request returns `Cache-Control: no-cache, must-revalidate` instead of the
   * `private, no-store, max-age=0` declared here. Next.js REPLACES `Cache-Control` on a dynamic
   * App Router response, and every route in this area is dynamic by necessity: each one reads the
   * session cookie, so none of them can be prerendered.
   *
   * The declaration is kept because it is correct intent and it does govern any response under this
   * path that Next.js does not manage itself. What it is NOT is a description of what a researcher
   * request receives, and an earlier draft of this comment said it was — a claim of a mechanism that
   * the platform silently replaces, which is worse than no comment.
   *
   * WHY THE MEASURED POSTURE STILL SATISFIES THE REQUIREMENT
   * ---------------------------------------------------
   * The requirement is a property — a response SHALL NOT be "stored or served from a shared cache in a
   * way that could deliver one researcher's content to another", and a scenario says the response
   * "is not marked as publicly cacheable". `no-cache, must-revalidate` with no `public` satisfies
   * both: nothing is marked publicly cacheable, and every reuse requires revalidation, which
   * re-runs the guard rather than replaying a stored decision. Two further facts close the gap:
   *
   *   - the refusal is a **403**, and 403 is not among the status codes HTTP permits to be
   *     heuristically cached, so a compliant shared cache will not store it on freshness grounds
   *     even before reading `no-cache`; and
   *   - `no-store` would be strictly stronger, and the only way to obtain it for a dynamic page in
   *     this router version is middleware — which this change deliberately does not add, because D6
   *     puts the authorization decision in a layout and a second file touching the researcher area is
   *     a second place to get it wrong.
   *
   * So the gap between the declared and the effective value is recorded here rather than papered
   * over. If a future Next.js version stops overriding this header, the effective posture tightens
   * on its own and nothing needs to change.
   *
   * `X-Robots-Tag` is belt and braces beside the Metadata API's `robots` declaration: `forbidden()`
   * injects a noindex meta tag on its own, but the sign-in page is served normally and relies on the
   * declared metadata, and this header covers both without either mechanism having to be remembered
   * per route.
   *
   * It is scoped to `/researcher/:path*` so it applies to every current and future route in the
   * area — a new researcher route is covered by omission here for the same reason it is covered by
   * omission in the guarded layout.
   */
  /**
   * Global browser-hardening headers (Change 4 of the pre-Phase-11 guardrail
   * program). Measured on main: this was the missing set — no route sent any
   * of these five. Declared here as a static `/:path*` block rather than set
   * per-response or in middleware, for the same reason the researcher block
   * above avoids middleware: one declaration, no second place to get it
   * wrong. Next.js applies EVERY block whose `source` matches the request
   * path and merges their header lists, so this composes with the
   * researcher-scoped block below instead of replacing it.
   *
   * `Permissions-Policy` switches off camera, microphone, and geolocation.
   * Geolocation is the one the anonymous study model cares about: location
   * must never be collected, so the platform declares it unavailable.
   */
  headers: async () => [
    {
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains",
        },
        {
          key: "Permissions-Policy",
          value: "camera=(), microphone=(), geolocation=()",
        },
      ],
    },
    {
      source: "/researcher/:path*",
      headers: [
        { key: "Cache-Control", value: "private, no-store, max-age=0" },
        { key: "X-Robots-Tag", value: "noindex, nofollow" },
      ],
    },
  ],
};

export default nextConfig;
