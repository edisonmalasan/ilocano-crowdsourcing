"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { signInAction } from "@/lib/admin/actions";
import { RESEARCHER_SIGN_IN_REFUSAL_MESSAGE } from "@/lib/admin/refusal";
import { RESEARCHER_HOME } from "@/lib/admin/routes";
import { Button } from "@/components/ui/button";
import { Field, controlClasses } from "@/components/ui/field";

/**
 * The researcher sign-in control.
 *
 * ============================================================================
 * WHY IT IS AN ISLAND, AND WHAT IT IS NOT ALLOWED TO DO
 * ============================================================================
 * The decision is entirely server-side — `runResearcherSignIn` compares the credential, consults the
 * durable counter, and issues the session. This component holds no credential of its own beyond the
 * field's current value, decides nothing about access, and receives no status it could pass back
 * to the server. It renders exactly one thing the server told it — the refusal message, which is
 * the SAME STRING for every refusal reason — and navigates on the success member, which carries
 * nothing to render. There is no client-side state that distinguishes "wrong credential" from
 * "rate limited" from "not configured".
 *
 * ============================================================================
 * WHY THERE IS BOTH `disabled` AND A REF LATCH
 * ============================================================================
 * `disabled={isPending}` is what the person sees. The latch is what makes the guarantee, and it is
 * not redundant with `disabled`: React commits `disabled` at the close of an event handler, so two
 * clicks dispatched inside ONE task both reach the handler while both still see the button enabled.
 * That is a real double-submit — two credential comparisons, two counter increments — and it is why
 * `tests/dom/researcher-sign-in.test.tsx` uses `pressMany` rather than two `press` calls. A test
 * written with two `press` calls would pass with the latch deleted, because `disabled` alone would
 * stop the second one; the latch's removal is only observable when both clicks land in one task.
 */

/** The submitted field name. Not credential-shaped, so a password manager does not try to fill it. */
const FIELD_NAME = "researcherAccessKey";

/** The placeholder. Generic on purpose: naming the credential's format would help nobody. */
const FIELD_LABEL = "Researcher access key";

export function SignInForm() {
  const [refusal, setRefusal] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  // Read inside the handler and written synchronously, so two clicks in one task both see `true`
  // and the second returns before any state is scheduled.
  const inFlight = useRef(false);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setRefusal(null);

    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      try {
        const result = await signInAction(formData);
        // Success and refusal arrive as SEPARATE members, so no `catch` anywhere here can turn
        // one into the other. A success navigates; only a returned refusal renders the message.
        if (result.status === "authenticated") {
          router.push(RESEARCHER_HOME);
          return;
        }
        setRefusal(result.message);
      } catch {
        // A Server Action REJECTS when the request never produced an answer: the deployment is down,
        // the connection dropped, or the server threw something this client cannot see. Without this
        // branch the rejection escapes the transition, `finally` releases the latch, the controls
        // return to idle, and the screen shows NOTHING — which for a researcher locked out of the
        // area is indistinguishable from the click not having registered.
        //
        // The SAME string the server uses is shown, imported rather than retyped. A distinct wording
        // would be a way to tell a transport failure from a rejected credential without being told,
        // which is the oracle the server-side single-message rule exists to prevent.
        setRefusal(RESEARCHER_SIGN_IN_REFUSAL_MESSAGE);
      } finally {
        inFlight.current = false;
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" aria-busy={isPending}>
      <Field
        label={FIELD_LABEL}
        name={FIELD_NAME}
        description="Paste the operator access key configured for this deployment."
        error={refusal ?? undefined}
        required
      >
        {({ id, describedBy, invalid }) => (
          <input
            id={id}
            name={FIELD_NAME}
            type="password"
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            autoComplete="off"
            spellCheck={false}
            disabled={isPending}
            required
            className={controlClasses({ invalid })}
          />
        )}
      </Field>

      <div>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Checking…" : "Sign in"}
        </Button>
      </div>
    </form>
  );
}
