import { z } from "zod";

/**
 * The researcher sign-in form's input contract.
 *
 * ONE field, deliberately. There is no username, no email, no name, and no "remember me": the
 * researcher area recognizes a member of the research team from a single environment-supplied
 * operator credential and from nothing else, so there is nothing for a second field to hold. A
 * "who am I" display is a Non-Goal of the change for the same reason — it would need an identity.
 *
 * ============================================================================
 * WHY THIS IS A SEPARATE SCHEMA AND NOT A FIELD ON A SHARED ONE
 * ============================================================================
 * `@/schemas/validation` and `@/schemas/validator` describe a VALIDATOR's response and a validator's
 * anonymous profile. This describes a request made by a member of the research team. Sharing a file
 * would put the researcher credential in the same module as validator data, which is precisely the
 * kind of adjacency that makes "one extra field" easy and this project's guarantees hard to state.
 *
 * `strictObject`, because a Server Action's arguments arrive from the network and anything extra in
 * the payload is a value this code did not ask for.
 */

/**
 * A bound on the submitted length.
 *
 * Not a security control — the credential is compared as a fixed-length digest, so a long value costs
 * nothing to compare — but an unbounded string is a request-body cost an unauthenticated party
 * chooses. 512 characters is far longer than any operator credential this project documents, so the
 * bound rejects only padding.
 *
 * Exceeding it produces the SAME refusal a wrong credential produces, because the rejection is
 * handled at the same place: a length is not a statement about which credentials are configured.
 */
const MAX_OPERATOR_CREDENTIAL_LENGTH = 512;

export const researcherSignInInputSchema = z.strictObject({
  /**
   * The presented operator credential, exactly as typed.
   *
   * No `.trim()`: a value differing by trailing whitespace is a different value, and the spec names
   * that as a refusal. Trimming here would accept a credential the operator did not choose, and it
   * would do so invisibly.
   */
  credential: z
    .string()
    .max(
      MAX_OPERATOR_CREDENTIAL_LENGTH,
      `must be at most ${MAX_OPERATOR_CREDENTIAL_LENGTH} characters`,
    ),
});

export type ResearcherSignInInput = z.infer<typeof researcherSignInInputSchema>;
