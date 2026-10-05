import { z } from "zod";

import { normalizeResearchText } from "@/lib/domain/text";
import {
  CANONICAL_SUFFIX_MAX,
  CANONICAL_SUFFIX_MIN,
  parseCanonicalEntryId,
} from "@/lib/domain/categories";

/**
 * Dataset entry contract.
 *
 * A `DatasetEntry` is a *static definition*: the imported synthetic research artifact. It is not
 * validation state, and the type is deliberately built so that a `ValidationResponse` cannot be
 * handed where an entry is expected (a validation carries `evaluation`/`validatorId` and no
 * `instruction`; an entry carries `instruction` and no `evaluation`). The split is what lets the
 * product hold the line that a validator's correction is stored beside the immutable source
 * instruction and never written over it.
 */

/** The category of the first planned dataset, Origin + Destination navigation instructions. */
export const ORIGIN_DESTINATION_CATEGORY = "origin_destination";

/**
 * Category is an *open* identifier, not a closed enum, on purpose.
 *
 * The platform must support further dataset categories without a code change, and category is not
 * the axis being validated: an entry's *wording* is. Encoding categories as an enum would put
 * every future import behind a deploy and would make a typo (`origin_destinations`) either a hard
 * import failure or a silently separate category. The constraint is therefore only the shape of
 * the identifier: trimmed, non-empty, lowercase `snake_case`.
 */
export const datasetCategorySchema = z
  .string()
  .trim()
  .min(1, "category must not be empty")
  .regex(
    /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/,
    "category must be lowercase snake_case (for example origin_destination)",
  );

/**
 * The externally meaningful canonical dataset entry ID, for example `ODT_63` or `D_800`.
 *
 * Canonical ids are READ from the immutable research source and preserved verbatim — never
 * reminted, never zero-padded: each is what allows a validation row, an export row, and the
 * original JSON record to be joined. Internal surrogate keys may be added alongside it, never
 * in place of it. The shape rule lives in `@/lib/domain/categories` and is shared with the
 * parser and research-facing ordering, so there is exactly one definition of canonical.
 */
export const datasetEntryIdSchema = z
  .string()
  .min(1, "id must not be empty")
  .refine((value) => parseCanonicalEntryId(value) !== null, {
    message:
      "id must be a canonical dataset id (prefix D, DT, OD, ODT, or CPE with an unpadded suffix 1..800, for example ODT_63)",
  });

/**
 * Normalizes a text field without deciding whether the value is required.
 *
 * Normalization is limited to trimming and whitespace-run collapsing (see `@/lib/domain/text`).
 * Case and punctuation are preserved: they are part of what validators are judging.
 */
const normalizedTextSchema = z.string().transform((value) => normalizeResearchText(value));

/**
 * Required, non-empty text. A value that normalizes to nothing is rejected rather than stored as
 * `null`, because a dataset entry with no instruction has nothing for a validator to judge.
 */
export const requiredTextSchema = normalizedTextSchema.refine((value) => value !== null, {
  message: "must not be empty",
});

/**
 * Reusable nullable-or-non-empty text field.
 *
 * `null` means "this category has no such concept" and is distinct from `""`. Modelling absence
 * as `null` rather than omitting the key is what allows a category without, say, a transit mode
 * to be represented without a schema change — and it is why the Origin + Destination import can
 * record `transit_mode: null` honestly instead of inventing a placeholder string. An omitted key
 * normalizes to `null` for the same reason, so an importer that simply leaves a field out and one
 * that sends an explicit `null` produce the same stored record.
 */
export const optionalTextSchema = normalizedTextSchema.nullable().default(null);

/** An ISO 8601 datetime string, as produced by `Date.prototype.toISOString()`. */
export const isoDateTimeSchema = z
  .string()
  .trim()
  .min(1, "timestamp must not be empty")
  .refine((value) => !Number.isNaN(Date.parse(value)), "timestamp must be an ISO 8601 datetime");

export const datasetEntryInputSchema = z.object({
  id: datasetEntryIdSchema,
  category: datasetCategorySchema,
  /**
   * The source-local id within the entry's category block, derived from the canonical id's
   * numeric suffix (1..800 per category). Explicit rather than derived at read time, so a
   * researcher never has to parse an identifier to recover it — and so a future prefix change
   * cannot silently re-identify every row.
   */
  sourceEntryId: z.number().int().min(CANONICAL_SUFFIX_MIN).max(CANONICAL_SUFFIX_MAX),
  /**
   * The human-readable source category name, verbatim from the mapping table. Provenance for
   * researchers; the slug remains the machine key.
   */
  categoryName: z.string().trim().min(1, "category name must not be empty"),
  instruction: requiredTextSchema,
  origin: optionalTextSchema,
  destination: optionalTextSchema,
  transitMode: optionalTextSchema,
});

export const datasetEntrySchema = datasetEntryInputSchema.extend({
  createdAt: isoDateTimeSchema,
  isActive: z.boolean().default(true),
});

export type DatasetCategory = z.infer<typeof datasetCategorySchema>;
export type DatasetEntryId = z.infer<typeof datasetEntryIdSchema>;
export type DatasetEntryInput = z.infer<typeof datasetEntryInputSchema>;
export type DatasetEntry = z.infer<typeof datasetEntrySchema>;
