/**
 * The one string a refused researcher sign-in is rendered with.
 *
 * ============================================================================
 * WHY IT LIVES HERE AND NOT ONLY IN THE SERVER MODULE
 * ============================================================================
 * `researcherSignInRefusalMessage()` in `@/lib/admin/signin-core` is server-only, because that module
 * reaches a repository. The sign-in FORM is a client island, so it cannot import it — and if the form
 * kept its own copy of the sentence, the two would drift, and the drift would be an oracle: a
 * transport failure shown with slightly different wording from a rejected credential is a way to tell
 * which of the two happened without being told.
 *
 * So there is one constant and both sides read it.
 *
 * ============================================================================
 * WHY A CLIENT MAY RENDER IT AT ALL
 * ============================================================================
 * This is NOT research data. It is the researcher area's own chrome, and that area is deliberately
 * outside `@/lib/i18n/copy`: the localization catalog holds the PUBLIC validator experience's words and
 * nothing else, and a research-boundary guard over that catalog stays meaningful only while researcher
 * strings live somewhere else. `tests/unit/admin-routes.test.tsx` asserts this constant is not in the
 * catalog.
 *
 * It says nothing about any credential, no environment value, and no reason. Every server-side
 * refusal reason renders as this same sentence, so showing it on a transport failure adds no
 * information the four server reasons do not already withhold.
 */
export const RESEARCHER_SIGN_IN_REFUSAL_MESSAGE =
  "That credential was not accepted. Check it and try again.";
