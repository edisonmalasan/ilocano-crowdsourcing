"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { clearResearcherSessionCookie, writeResearcherSessionCookie } from "@/lib/admin/cookie";
import { getAdminEnv } from "@/lib/admin/env";
import {
  formatSignInDiagnostic,
  runResearcherSignIn,
  researcherSignInRefusalMessage,
} from "@/lib/admin/signin-core";
import { resolveOriginKey } from "@/lib/admin/origin";
import { getServerEnv } from "@/lib/env/server";
import { getOpsWebhookUrl } from "@/lib/ops/dispatch";
import type { OperationalSignal } from "@/lib/ops/monitoring";
import { safeRecordOperationalSignal } from "@/lib/ops/recorder";
import type { SignInAttemptsRepository } from "@/lib/repositories";
import {
  createSignInAttemptsRepository,
  createSupabaseRepositories,
} from "@/lib/repositories/supabase";
import { isWriteIntentError, parseWriteIntent } from "@/lib/server/write-intake";
import { researcherSignInInputSchema } from "@/schemas/researcher";

/**
 * The researcher area's Server Actions.
 *
 * This file is the ONLY place in the sign-in path that constructs a privileged Supabase client, and
 * it constructs it INSIDE the request rather than at module scope — so a deployment with no database
 * configured produces the same refusal as one with a wrong credential, instead of an import that
 * throws the moment the module graph is evaluated.
 *
 * Every decision lives in `@/lib/admin/signin-core`, which takes its repository and clock as
 * arguments and is therefore unit-tested with no database and no credential. These two functions do
 * four things and no more: read the request, read the environment, delegate, and manage the cookie.
 */

import { RESEARCHER_SIGN_IN } from "@/lib/admin/routes";

/** The form field the sign-in control submits under. Not a credential-like name, so a password manager does not fill it. */
const CREDENTIAL_FIELD = "researcherAccessKey";

/**
 * The single outward answer to a refused sign-in.
 *
 * One member of the result union below, alongside an authenticated member that carries
 * nothing. Success travels as a RETURNED value rather than as a thrown redirect, so no
 * client-side `catch` — present or future — can convert a granted access into the refusal
 * message. The browser learns nothing beyond which member arrived: the cookie is set, and
 * navigation is the form's own decision on the success member.
 */
export interface ResearcherSignInRefusal {
  readonly status: "refused";
  readonly message: string;
}

/**
 * A successful sign-in, as a value.
 *
 * Deliberately empty: the session travels as the httpOnly cookie the server just set, and the
 * credential never travels at all. Anything added here would be something the browser is told,
 * so this stays a bare status by design rather than by omission.
 */
export interface ResearcherSignInSuccess {
  readonly status: "authenticated";
}

export type ResearcherSignInResult = ResearcherSignInSuccess | ResearcherSignInRefusal;

/**
 * Exchanges a presented operator credential for a session cookie.
 *
 * The payload is re-parsed with the SAME schema the form used, before anything else happens. A
 * Server Action's arguments arrive from the network, so the form's own validation is a UI affordance
 * and not a boundary; `@/lib/server/write-intake` exists so that rule cannot be forgotten in one
 * place, and this action is one of its callers.
 */
export async function signInAction(formData: FormData): Promise<ResearcherSignInResult> {
  // The field must appear EXACTLY ONCE. `formData.get` returns the first value and says nothing
  // about the rest, so a payload carrying two copies would be silently half-read — and which copy
  // wins would depend on the browser rather than on this code.
  //
  // This is not a security control, and it is worth being accurate about that: an attacker who can
  // post to this action can post exactly one copy just as easily. What it removes is an ambiguity,
  // which is the same reason `strictObject` is used below — the payload is refused when it is not
  // what this code asked for, rather than being read as best it can be.
  const submitted = formData.getAll(CREDENTIAL_FIELD);
  if (submitted.length !== 1) {
    return { status: "refused", message: researcherSignInRefusalMessage() };
  }

  let credential: string;
  try {
    credential = parseWriteIntent(
      researcherSignInInputSchema,
      { credential: submitted[0] },
      { schemaName: "researcherSignInInput" },
    ).credential;
  } catch (cause) {
    // A malformed payload is the same refusal as a wrong credential. It is NOT counted against the
    // attempt limit, and that is deliberate: a payload this code cannot even read was never compared
    // against a credential, so counting it would let anyone pad a field to lock out a real operator.
    if (isWriteIntentError(cause)) {
      return { status: "refused", message: researcherSignInRefusalMessage() };
    }
    throw cause;
  }

  // The environment is read ONCE, here, and the privileged client is constructed only if it is
  // configured.
  //
  // This ordering is load-bearing and was a real defect before this test existed. Written as one
  // object literal, `deps: { attempts: createSignInAttemptsRepository() }` is evaluated EAGERLY —
  // before `runResearcherSignIn` runs its first line — so an unconfigured deployment constructed a
  // service-role client on every sign-in attempt and then threw, rather than refusing cleanly.
  // That contradicts the module's own header, and the throw would have surfaced as a 500: a
  // deployment that has not configured a researcher credential would have broken on the sign-in
  // page instead of closing it.
  //
  // `adminEnv` is also captured once rather than read inside the call, so the environment a decision
  // is made against and the one a client is built for cannot differ.
  const originKey = await requestOriginKey();
  const adminEnv = getAdminEnv();
  if (adminEnv === null) {
    // Logged here rather than in the core, because this refusal never reaches it: the
    // environment check precedes repository construction, so there is no decision to delegate
    // to. Same line shape, same sink, via the shared formatter — not a second dialect.
    console.info(
      `[sadino:researcher-signin] ${formatSignInDiagnostic({ kind: "refused", reason: "not_configured", originKey })}`,
    );
    return { status: "refused", message: researcherSignInRefusalMessage() };
  }

  // Constructing the repository CAN THROW — a malformed `SUPABASE_URL`, or a project that has been
  // deleted — and a throw here would escape the action as an unhandled 500.
  //
  // It becomes the same refusal every other unreachable-counter case produces, which is the fail-closed
  // answer rather than the fail-open one. The cost is a diagnostic: a deployment whose database is
  // misconfigured refuses sign-in indistinguishably from one whose counter is merely down, and this
  // project has no error-reporting service to tell the two apart. That trade is deliberate and it is
  // why the deployment obligation in `docs/ROADMAP.md` exists — the refusal is correct, and the
  // diagnosis is the operator's to make from their own project settings.
  let attempts: SignInAttemptsRepository;
  try {
    attempts = createSignInAttemptsRepository();
  } catch {
    console.info(
      `[sadino:researcher-signin] ${formatSignInDiagnostic({ kind: "refused", reason: "counter_unavailable", originKey })}`,
    );
    return { status: "refused", message: researcherSignInRefusalMessage() };
  }

  const outcome = await runResearcherSignIn({
    presented: credential,
    adminEnv,
    originKey,
    deps: {
      attempts,
      nowMs: Date.now(),
      // The only I/O this decision performs. Namespaced so the line is attributable in a shared
      // log; the core formats the line and never sees the console.
      log: (line) => console.info(`[sadino:researcher-signin] ${line}`),
    },
  });

  if (outcome.status === "refused") {
    // Best-effort operational counter for a refused sign-in. Refusals that never reach the
    // core (malformed payload, unconfigured deployment) are not sign-in failures and are not
    // counted here — this mirrors the durable attempt counter's own scope.
    await tryRecordOperationalSignal("researcher_signin_failed");
    return { status: "refused", message: researcherSignInRefusalMessage() };
  }

  await writeResearcherSessionCookie(outcome.session);
  // Returned, not redirected. `redirect()` signals by THROWING, and a throw crosses the Server
  // Action boundary as a rejection — which the form's `catch` renders as the refusal message,
  // showing a refusal for an access that was just granted. A returned value cannot be caught
  // into a refusal by anything downstream.
  return { status: "authenticated" };
}

/**
 * Ends the researcher session.
 *
 * Clears the cookie and issues NOTHING in its place — no replacement session, no refreshed expiry.
 * The spec requires both, and "no replacement" is easy to get wrong by accident: a sign-out that
 * re-set the cookie with a fresh `maxAge` would look like it worked while quietly extending the old
 * session's life.
 *
 * The attempt counter is NOT cleared here, and that is also deliberate. The counter is keyed by
 * ORIGIN, not by researcher, so clearing it on sign-out would hand a fresh allowance to whoever
 * happens to share that origin — which under a shared or NAT'd egress is not the person who signed
 * out.
 *
 * It takes no argument and touches no repository, so a click here issues no privileged read.
 */
export async function signOutAction(): Promise<void> {
  await clearResearcherSessionCookie();
  redirect(RESEARCHER_SIGN_IN);
}

/**
 * Best-effort operational counter for a refused researcher sign-in. Own dependencies, own
 * environment check, never throws — see the onboarding actions' identical helper.
 */
async function tryRecordOperationalSignal(signal: OperationalSignal): Promise<void> {
  try {
    getServerEnv();
    const { operationalEvents } = createSupabaseRepositories();
    await safeRecordOperationalSignal(
      {
        events: operationalEvents,
        webhookUrl: getOpsWebhookUrl(),
        log: (message, error) => console.info(`[sadino:researcher-signin] ${message}`, error),
      },
      signal,
    );
  } catch {
    // Absorbed: the recorder already logged, and sign-in already decided its answer.
  }
}

/**
 * The coarse origin this request is accounted against.
 *
 * The decision — which header, which entry, what to do with none of them — belongs to
 * `@/lib/admin/origin`, which is a pure function over a header reader. This is the two lines that
 * adapt Next.js's `headers()` to that reader, and nothing more.
 *
 * A FORWARDED HEADER is what this uses, and the honest limitation is stated rather than papered
 * over: on a deployment that does not strip `x-forwarded-for`, an unauthenticated party can choose
 * its own key and therefore its own counter. That is why the spec calls this a rate limit rather
 * than an authorization control — the authorization decision is the credential comparison, and this
 * row has nothing to do with it.
 *
 * It holds no address beyond this string, no account, and nothing joinable to a validation response —
 * which is what lets it be stored in a research database at all.
 */
async function requestOriginKey(): Promise<string> {
  const jar = await headers();
  return resolveOriginKey((name) => jar.get(name));
}
