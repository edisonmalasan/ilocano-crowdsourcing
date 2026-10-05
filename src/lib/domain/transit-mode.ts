import { z } from "zod";

/**
 * The shared transit-mode domain: scalar, absent, or an ordered pair.
 *
 * PURE: no file, database, network, or clock. The parser, the dataset and batch
 * schemas, the repository mapping, the review rendering, and both export
 * serializers share this module so there is exactly one definition of what a
 * transit mode is — and scattered one-off unions cannot disagree about it.
 *
 * The vocabulary is closed: `walking`, `jeepney`, `taxi`, `private_vehicle`.
 * A pair holds exactly two DISTINCT values with source order preserved. Order
 * is provenance, never preference: the first mode is not the preferred mode
 * unless the instruction says so.
 */

/** The four approved transit modes, stated once. */
export const TRANSIT_MODES = ["walking", "jeepney", "taxi", "private_vehicle"] as const;

/** One transit mode. */
export type TransitMode = (typeof TRANSIT_MODES)[number];

/** Two distinct transit modes with source order preserved (Double Transit Mode only). */
export type TransitModePair = readonly [TransitMode, TransitMode];

/** Absent, one mode, or an ordered pair of two distinct modes. */
export type TransitModeValue = TransitMode | TransitModePair | null;

/** True for exactly the four approved labels. */
export function isTransitMode(value: unknown): value is TransitMode {
  return typeof value === "string" && (TRANSIT_MODES as readonly string[]).includes(value);
}

/**
 * True for an array-like value holding exactly two distinct approved modes.
 *
 * Accepts readonly arrays and plain arrays; rejects one-element, three-element,
 * duplicated, and out-of-vocabulary values. Order is preserved, never sorted.
 */
export function isTransitModePair(value: unknown): value is TransitModePair {
  if (!Array.isArray(value) || value.length !== 2) return false;
  const [first, second] = value as readonly unknown[];
  if (!isTransitMode(first) || !isTransitMode(second)) return false;
  return first !== second;
}

/** True for `null`, one approved mode, or an ordered distinct pair. */
export function isTransitModeValue(value: unknown): value is TransitModeValue {
  return value === null || isTransitMode(value) || isTransitModePair(value);
}

/**
 * Researcher-facing rendering of a transit-mode value.
 *
 * Scalar renders as itself; a pair renders as `a + b` (both modes, order
 * preserved); `null` renders as `null` so the caller decides the absent-case
 * display (the review view shows an em dash for absent fields).
 */
export function formatTransitModeValue(value: TransitModeValue): string | null {
  if (value === null) return null;
  if (isTransitMode(value)) return value;
  return `${value[0]} + ${value[1]}`;
}

/**
 * A transit-mode value as a flat CSV cell.
 *
 * Scalars travel bare (`jeepney`); a pair travels as compact JSON
 * (`["jeepney","walking"]`, order preserved) so the two modes cannot be
 * confused with a comma-joined sentence fragment; `null` stays `null` per the
 * CSV null/blank contract.
 */
export function serializeTransitModeCsvCell(value: TransitModeValue): string | null {
  if (value === null) return null;
  if (isTransitMode(value)) return value;
  return JSON.stringify([value[0], value[1]]);
}

/**
 * The inverse of `serializeTransitModeCsvCell` for the pair case.
 *
 * Returns the ordered pair for a compact-JSON pair cell, the scalar for a bare
 * label, and `null` for an empty cell. Returns `null` for anything else rather
 * than guessing — a malformed cell is absence, not a third mode.
 */
export function parseTransitModeCsvCell(cell: string | null): TransitModeValue {
  if (cell === null || cell === "") return null;
  if (isTransitMode(cell)) return cell;
  try {
    const parsed: unknown = JSON.parse(cell);
    return isTransitModePair(parsed) ? (parsed as TransitModePair) : null;
  } catch {
    return null;
  }
}

/** One approved mode label. */
export const transitModeSchema = z.enum(TRANSIT_MODES, {
  message: `transit_mode must be one of ${TRANSIT_MODES.join(", ")}`,
});

/** An ordered pair of two distinct approved modes. */
export const transitModePairSchema = z
  .array(transitModeSchema)
  .length(2, "a transit-mode pair holds exactly two modes")
  .refine(([first, second]) => first !== second, {
    message: "a transit-mode pair holds two distinct modes",
  })
  .transform(([first, second]) => [first, second] as const);

/** Absent, one mode, or an ordered distinct pair. */
export const transitModeValueSchema = z
  .union([z.null(), transitModeSchema, transitModePairSchema], {
    message:
      "transit_mode must be one of walking, jeepney, taxi, private_vehicle, an ordered pair of two distinct modes, or null",
  })
  .default(null);
