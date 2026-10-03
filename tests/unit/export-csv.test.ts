/**
 * The export's CSV form, proved by PARSING IT BACK.
 *
 * A quoting test that only asserts the output *contains* an escaped sequence proves the writer put
 * the characters somewhere; it does not prove a reader recovers the original. So this file contains a
 * small RFC 4180 parser and every round-trip assertion runs through it. The parser is test-local on
 * purpose — it is the instrument, and shipping it would put unexported test machinery in the
 * application.
 */
import { describe, expect, it } from "vitest";

import { buildCsv, csvField, csvRow } from "@/lib/export/csv";
import { EXPORT_RECORD_KEYS, type ExportRecord } from "@/lib/export/records";

/** A record with every field absent — the shape a `cannot_evaluate` response produces. */
const record = (): ExportRecord =>
  Object.fromEntries(EXPORT_RECORD_KEYS.map((key) => [key, null])) as ExportRecord;

const FULL: ExportRecord = {
  dataset_entry_id: "OD_0001",
  category: "origin_destination",
  validation_id: "res_01",
  validator_id: "VAL_00000001",
  self_reported_proficiency: "fluent",
  evaluation: "correct_natural",
  corrected_instruction: null,
  english_translation: "Go north past the market.",
  filipino_translation: "Dumiretso ka sa hilaga.",
  qualifies_toward_completion: "true",
  submitted_at: "2026-09-30T12:00:00.000Z",
};

/**
 * A minimal RFC 4180 parser: fields separated by commas, records by LF, fields optionally quoted with
 * `""` meaning a literal quote.
 *
 * WHAT IT REJECTS, measured rather than assumed: a quote opened MID-FIELD (`a,b"c,d` → throws) and an
 * unterminated quoted field (`a,"bc,d` → throws). What it does NOT reject — recorded because a comment
 * claiming otherwise was measured false — is text after a closing quote: `a,"b"c,d` parses to
 * `["a","bc","d"]` without complaint.
 *
 * That leniency is harmless HERE because the assertions it serves are stricter than the parser: every
 * cell is compared against the original value, and row counts are asserted. A writer emitting `"b"c`
 * for an original `bc` would round-trip to `bc` here, so the round trip is not what rules that out —
 * the per-cell equality is. The parser's job is to give the assertions a faithful value to compare,
 * not to be the test.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let fieldStarted = false;

  const endField = (): void => {
    row.push(field);
    field = "";
    fieldStarted = false;
  };
  const endRow = (): void => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i] as string;

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      if (fieldStarted && field.length > 0) {
        throw new Error(`quote opened mid-field at ${i}: ${JSON.stringify(field)}`);
      }
      inQuotes = true;
      fieldStarted = true;
      continue;
    }
    if (char === ",") {
      endField();
      continue;
    }
    if (char === "\n") {
      endRow();
      continue;
    }
    field += char;
    fieldStarted = true;
  }
  if (inQuotes) throw new Error("unterminated quoted field");
  if (field.length > 0 || row.length > 0) endRow();

  return rows;
}

describe("csvField", () => {
  it("leaves a plain value bare", () => {
    expect(csvField("Go north")).toBe("Go north");
  });

  it("renders null as an empty field, never the word null", () => {
    expect(csvField(null)).toBe("");
    expect(csvField(null)).not.toBe("null");
  });

  it("quotes a field containing a comma", () => {
    expect(csvField("one, two")).toBe('"one, two"');
  });

  it("doubles an embedded quote and wraps the field", () => {
    expect(csvField('He said "yes"')).toBe('"He said ""yes"""');
  });

  it("quotes a field containing a newline and keeps the newline", () => {
    expect(csvField("line one\nline two")).toBe('"line one\nline two"');
    expect(csvField("carriage\rreturn")).toBe('"carriage\rreturn"');
  });

  it("quotes an empty-but-present-looking value only when it needs to", () => {
    expect(csvField("")).toBe("");
  });
});

describe("a full round trip", () => {
  it("recovers every field exactly, including commas, quotes and newlines in research text", () => {
    // The research text is the reason this file exists. A translation containing a comma, a double
    // quote and a line break must come back out of the CSV identical to what went in.
    const nasty: ExportRecord = {
      ...FULL,
      english_translation: 'Go north, then say "here" —\nsecond line',
      filipino_translation: "Pumunta, ka sa 'hilaga'",
      corrected_instruction: 'Iti, Baguio — " Athletic Bowl',
    };

    const rows = parseCsv(buildCsv([nasty]));

    expect(rows).toHaveLength(2);
    const header = rows[0] as string[];
    const values = rows[1] as string[];
    expect(header).toEqual([...EXPORT_RECORD_KEYS]);

    for (const [index, key] of EXPORT_RECORD_KEYS.entries()) {
      expect(values[index], `column ${key} must round-trip`).toBe(nasty[key] ?? "");
    }
    expect(values[header.indexOf("english_translation")]).toBe(nasty.english_translation);
    expect(values[header.indexOf("filipino_translation")]).toBe(nasty.filipino_translation);
  });

  it("keeps a record with every optional field absent at the full column count", () => {
    // A `cannot_evaluate` response has no correction and no translations. The row must still have one
    // cell per column, or a consumer reading positionally reads the wrong field.
    const sparse: ExportRecord = {
      ...record(),
      dataset_entry_id: "OD_0002",
      evaluation: "cannot_evaluate",
    };

    const rows = parseCsv(buildCsv([sparse]));

    expect(rows[1]).toHaveLength(EXPORT_RECORD_KEYS.length);
  });

  it("does not merge two records into one row", () => {
    const rows = parseCsv(
      buildCsv([
        { ...FULL, validation_id: "res_01" },
        { ...FULL, validation_id: "res_02" },
      ]),
    );

    expect(rows).toHaveLength(3);
    expect((rows[1] as string[])[EXPORT_RECORD_KEYS.indexOf("validation_id")]).toBe("res_01");
    expect((rows[2] as string[])[EXPORT_RECORD_KEYS.indexOf("validation_id")]).toBe("res_02");
  });

  it("ends the document on a line boundary", () => {
    expect(buildCsv([FULL]).endsWith("\n")).toBe(true);
  });

  it("emits a header even with no records", () => {
    expect(buildCsv([])).toBe(`${EXPORT_RECORD_KEYS.join(",")}\n`);
  });
});

describe("csvRow", () => {
  it("emits columns in the declared key order, not in object key order", () => {
    // Both objects below carry the same keys in a different insertion order. Reading the key set from
    // the record instead of from `EXPORT_RECORD_KEYS` would produce two files whose columns mean
    // different things.
    const reordered = Object.fromEntries(
      [...EXPORT_RECORD_KEYS].reverse().map((key) => [key, FULL[key]]),
    ) as ExportRecord;

    expect(csvRow(reordered)).toBe(csvRow(FULL));
  });
});
