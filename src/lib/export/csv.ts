/**
 * CSV rendering of the export records, with RFC 4180 quoting.
 *
 * No CSV library, deliberately: the quoting rules are four lines, a dependency for them would be
 * unauditable at a glance, and the round-trip test is what makes a hand-rolled serializer
 * trustworthy rather than merely short (see `tests/unit/export-csv.test.ts`, which PARSES the output
 * back and compares it to the original text).
 *
 * The rules, and why each exists:
 *
 *   - a field containing a comma, a double quote, CR, or LF is wrapped in double quotes — without
 *     this a translation containing a comma silently becomes two columns, which is the classic way
 *     a research export corrupts itself;
 *   - an embedded double quote is DOUBLED (`"` → `""`) — the escape RFC 4180 defines, and the one a
 *     naive implementation forgets;
 *   - a field containing a newline is quoted, and the newline is kept literally — the alternative,
 *     replacing it, would change a validator's text;
 *   - a field that needs no quoting is emitted bare, so the common case stays readable.
 *
 * Spreadsheet safety (Change 5, pre-Phase-11 guardrail): a field whose first
 * character is `=`, `+`, `-`, `@`, tab, or CR is prefixed with a single
 * quote, so a spreadsheet opens it as text rather than as a live formula.
 * The quote is the OWASP text-marker convention: Excel displays the value
 * unchanged, and a consumer parsing the CSV strips one leading `'` before a
 * dangerous character as the guard, not the data. Measured against all 4,800
 * merged source records, zero fields start dangerous, so no current byte
 * changes — the guard covers validator-authored corrections and translations
 * Phase 11 is about to collect. Header rows never start dangerous and JSON
 * exports (no formula evaluation) are untouched.
 *
 * Nothing is dropped to make quoting easier. Every record carries the same columns in the same
 * order, and `null` becomes an empty field — which is a real absence, not the string "null".
 */

/** A field's CSV form. `null` is an empty field; it is never the four characters `null`. */
export function csvField(value: string | null): string {
  if (value === null) return "";
  if (value === "") return "";
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  if (!/[",\r\n]/.test(safe)) return safe;
  return `"${safe.replace(/"/g, '""')}"`;
}

/**
 * One record as a CSV line, in the passed key order.
 *
 * The keys are a parameter rather than an import because two documents share these quoting rules
 * over different columns: the raw per-response records and the validated per-entry records. A
 * second serializer would double the surface that can drift; a shared one keeps one
 * implementation behind both round-trip tests.
 */
export function csvRow<const K extends string>(
  record: Readonly<Record<K, string | null>>,
  keys: readonly K[],
): string {
  return keys.map((key) => csvField(record[key])).join(",");
}

/**
 * The full CSV document: a header row from the key set, then one line per record, LF-separated.
 *
 * The trailing newline is included so the file ends on a line boundary — a POSIX text-file
 * convention that some readers rely on and whose absence is invisible in a diff.
 */
export function buildCsv<const K extends string>(
  records: readonly Readonly<Record<K, string | null>>[],
  keys: readonly K[],
): string {
  const lines = [keys.join(","), ...records.map((record) => csvRow(record, keys))];
  return `${lines.join("\n")}\n`;
}
