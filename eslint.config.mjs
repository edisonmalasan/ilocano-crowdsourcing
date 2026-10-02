import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * ============================================================================
 * Server/client trust boundary
 * ============================================================================
 *
 * `AGENTS.md` requires the boundary between privileged persistence access and browser code to be
 * a real trust boundary, not a review convention. It is enforced three times over, on purpose:
 *
 *   1. `import "server-only"` inside `src/lib/supabase/admin.ts` and `src/lib/env/server.ts`
 *      makes the Next.js bundler fail the build on a client import.
 *   2. The `sadino/no-privileged-imports` rule below reports a precise, named violation with the
 *      offending file, which is a better developer experience than a bundler stack trace.
 *   3. `src/lib/supabase/browser.ts` deliberately does not re-export the server or privileged
 *      constructors, so the "safe" import path is also the only one reachable from a component.
 *
 * Layer 2 is what CI asserts. Layer 1 is the runtime backstop. Neither replaces the other.
 */

/** Module specifiers that must never be reachable from browser-side code. */
const PRIVILEGED_SPECIFIERS = [
  // Privileged (service-role) Supabase access.
  "@/lib/supabase/admin",
  "@/lib/repositories/supabase",
  // The one `createClient(url, key)` call in the repository, separated from `@/lib/supabase/admin`
  // because it deliberately does NOT carry `import "server-only"` and is therefore not caught by
  // that marker. It takes the service-role key as a PARAMETER — `@/lib/env/server` is what reads
  // the environment, and that module still has the marker — so a client import would put the code
  // that consumes a service-role key on the browser. The boundary rule is the whole of its
  // protection, which is exactly why it has to be listed here.
  //
  // Listed separately from the specifier above for the same reason `@/lib/admin/signin-core` is:
  // `@/lib/repositories/supabase` matches the DIRECTORY in the sense ESLint sees only as an exact
  // string, so `@/lib/repositories/supabase/rpc` does not match it and would be silently allowed.
  "@/lib/supabase/admin-client",
  "@/lib/repositories/supabase/rpc",
  // Cookie-backed server client: pulls `next/headers`, unusable in a client component.
  "@/lib/supabase/server",
  // Server environment parsing, which reads the service-role credential.
  "@/lib/env/server",
  // The researcher area's environment contract, which reads the operator credential and the
  // session-protection secret. Listed separately from `@/lib/env/server` because it is a DIFFERENT
  // schema with a different failure mode (it refuses rather than throwing), and because the two
  // must be able to diverge in the privileged list without anyone having to notice they are
  // unrelated contracts that happen to both read secrets.
  "@/lib/admin/env",
  // Credential comparison and session signing/verification. Both are `server-only` and both take a
  // secret as an argument, so a client import would be bundling the code that processes it.
  "@/lib/admin/credentials",
  "@/lib/admin/session",
  // The route guard and the cookie helpers, which pull `next/headers` and the env contract.
  "@/lib/admin/guard",
  "@/lib/admin/cookie",
  // The sign-in DECISION. Server-side because it reads the environment and constructs no client of
  // its own — `actions.ts` is the only module allowed to pass it a repository.
  //
  // This entry was MISSING while the comment above described it, and an independent verification pass
  // measured the absence rather than reading it off the comment. A comment that describes list
  // membership is a claim about a guard, so it is now true: `signin-core` holds the credential
  // comparison call, the limit decision, and the issuance call, and a client import would put all
  // three on the browser. Nothing else caught it — `import "server-only"` in the module is a runtime
  // marker that only fires if the module is actually reached, and one structural test scanned for it
  // by hand.
  "@/lib/admin/signin-core",
  // NOTE: `@/lib/admin/actions` is deliberately ABSENT from this list. It is the Server Action
  // boundary, and a client component importing it is the supported and intended shape — that is how
  // the sign-in form reaches a decision it is not allowed to make. Listing it would make the
  // boundary unimplementable, and the rule's purpose is to keep the DECISION off the browser.
  // Direct persistence access from the browser.
  "@supabase/supabase-js",
  "@supabase/ssr",
];

const boundaryPlugin = {
  meta: { name: "sadino-boundary", version: "1.0.0" },
  rules: {
    "no-privileged-imports": {
      meta: {
        type: "problem",
        docs: {
          description:
            "Disallow client-side modules from importing privileged persistence or server-environment modules.",
        },
        schema: [
          {
            type: "object",
            properties: { specifiers: { type: "array", items: { type: "string" } } },
            additionalProperties: false,
          },
        ],
        messages: {
          forbidden:
            "'{{specifier}}' is privileged and must not be reachable from browser-side code. Client code must call a server/domain service boundary (a Server Action or Route Handler) instead. See AGENTS.md -> Architecture rules.",
        },
      },
      create(context) {
        const options = context.options[0] ?? {};
        const forbidden = new Set(options.specifiers ?? PRIVILEGED_SPECIFIERS);
        const sourceCode = context.sourceCode ?? context.getSourceCode();

        // Gate the whole rule on the module kind, resolved once per file.
        //
        // - A file carrying the "use client" directive is browser-side by definition.
        // - A file under `src/components/` is presentation-only: it renders into client
        //   components, so it is browser-side regardless of its own directive.
        //
        // Server Components and Route Handlers are *allowed* to import these modules — that is
        // where privileged access belongs — so they are skipped here and instead rely on the
        // `server-only` runtime backstop.
        const isClientModule = /^\s*(['"])use client\1/.test(sourceCode.getText(sourceCode.ast));
        const isComponent = context.filename.includes("/components/");

        if (!isClientModule && !isComponent) return {};

        function report(value, line) {
          if (!forbidden.has(value)) return;
          context.report({
            loc: { line, column: 0 },
            messageId: "forbidden",
            data: { specifier: value },
          });
        }

        return {
          // Static imports and re-exports.
          ImportDeclaration(node) {
            report(node.source.value, node.source.loc.start.line);
          },
          ExportNamedDeclaration(node) {
            if (node.source) report(node.source.value, node.source.loc.start.line);
          },
          ExportAllDeclaration(node) {
            report(node.source.value, node.source.loc.start.line);
          },
          // `await import("@/lib/supabase/admin")` is just as much a client import.
          ImportExpression(node) {
            const argument = node.source;
            if (argument?.type !== "Literal" || typeof argument.value !== "string") return;
            report(argument.value, argument.loc.start.line);
          },
        };
      },
    },
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  {
    plugins: { sadino: boundaryPlugin },
    rules: {
      "sadino/no-privileged-imports": ["error", { specifiers: PRIVILEGED_SPECIFIERS }],
    },
  },

  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "dist/**",
    "coverage/**",
    "node_modules/**",
    "next-env.d.ts",
    // Generated by the OpenSpec CLI; not ours to lint.
    ".agents/**",
  ]),
]);

export default eslintConfig;
