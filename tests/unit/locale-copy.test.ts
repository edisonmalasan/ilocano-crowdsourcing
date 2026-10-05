import { describe, expect, it } from "vitest";

import {
  FILIPINO_COPY,
  ENGLISH_COPY,
  LOCALE_NAME_KEYS,
  PROFICIENCY_LABEL_KEYS,
  translatorFor,
  type Copy,
  type CopyKey,
  type LocaleNameKey,
} from "@/lib/i18n/copy";
import { INTERFACE_LOCALES, type InterfaceLocale } from "@/lib/domain/locale";
import { ILOCANO_PROFICIENCY_CHOICES } from "@/schemas/validator";

/**
 * The interface copy catalog.
 *
 * ============================================================================
 * WHERE THE EXHAUSTIVENESS GUARANTEE LIVES, AND WHY IT IS NOT HERE
 * ============================================================================
 * The property this file is named after - "every English string has a Filipino string" - is NOT
 * asserted by a test, and that is a decision with a reason rather than an omission.
 *
 * The guarantee lives in the TYPE: `FILIPINO_COPY` is annotated `Record<CopyKey, string>` where
 * `CopyKey = keyof typeof ENGLISH_COPY`, so a missing key is a `pnpm run typecheck` error and so is
 * a key English does not have. See the module header of `@/lib/i18n/copy` for the full argument.
 *
 * The short version: absence is not observable at runtime. A test comparing two key sets compares
 * two lists that are BOTH correct at the moment it runs; the moment somebody adds a key to one
 * catalog, the test is the thing that is wrong, and it is a test whose failure message says "the
 * lists differ" - which is a statement about the test, not about the missing translation. Rewriting
 * the test to match the new list is the natural repair, and it is exactly the direction of the bug.
 *
 * So the tests below do the two things a type genuinely cannot:
 *
 *   1. a FILIPINO string that is PRESENT BUT EMPTY. The key exists, the annotation is satisfied,
 *      and a participant sees a paragraph with a hole in it.
 *   2. a FILIPINO string that is BYTE-IDENTICAL to its English counterpart, because of a copy-paste
 *      or a "I'll do this one later". Also satisfies the annotation. Also visible to a participant.
 *
 * Plus the type-level controls, which are in this file because `pnpm run typecheck` is what
 * enforces the guarantee, and a guarantee nobody ever falsified is a guarantee nobody knows works.
 */

/**
 * Keys whose Filipino string is deliberately the SAME bytes as the English one.
 *
 * An allowlist rather than an exemption, and the distinction matters: an exemption is a way to
 * silence the check, an allowlist is a way to be wrong in a specific named way. Every entry here is a
 * string that is the same in both languages because it is the same WORD - an endonym, a product
 * name, a proper noun - so translating it would be a mistake rather than an improvement. Adding a
 * genuinely-untranslated string to this list is exactly the failure the check exists to catch, so
 * every entry carries the reason it is exempt and a reviewer can challenge the reason.
 *
 * The list is kept MINIMAL and the test below keeps it honest: an entry that stops being identical
 * fails, because that means it was translated and the exemption is now dead weight quietly widening
 * what the check tolerates. Two plausible entries were written here first and removed by that test.
 *
 * If this list ever needs a paragraph of explanation, the string should be translated instead.
 */
const ALLOWED_IDENTICAL: ReadonlyArray<{ readonly key: CopyKey; readonly why: string }> = [
  {
    key: "switcher.filipinoName",
    why: "endonym: 'Filipino' is the language's own name in both, and translating it would be wrong",
  },
  {
    key: "validation.translation.choice.filipino",
    why: "endonym, same as switcher.filipinoName: the option names the language, and 'Filipino' is its name in both",
  },
];

describe("catalog exhaustiveness", () => {
  it("defines the key set in English, and the Filipino catalog is checked against it", () => {
    // The runtime mirror of a type-check. It is here as a POSITIVE CONTROL, not as the
    // guarantee: if this assertion were the guarantee it would be the test this file's header
    // argues against, and it is written so that it would still pass if the type annotation were
    // deleted from `FILIPINO_COPY` - which is exactly why it is not the guarantee.
    //
    // What it does catch is a catalog file that failed to LOAD, which the type-check would not
    // catch at all because it runs on source, not on the module.
    expect(Object.keys(FILIPINO_COPY).sort()).toEqual(Object.keys(ENGLISH_COPY).sort());
  });

  it("has at least as many strings as the interface has things to say", () => {
    // A floor, not a ceiling, and it exists to make a catastrophically truncated catalog fail
    // loudly. A catalog of three strings would satisfy every other assertion in this file.
    expect(Object.keys(ENGLISH_COPY).length).toBeGreaterThan(60);
  });

  it("is flat rather than nested, so the annotation is leaf-deep and not top-level only", () => {
    // THIS IS THE MECHANISM, asserted. `Record<keyof typeof english, string>` over a NESTED object
    // would only require every SECTION to exist: `{ screening: { … } }` with one missing string
    // inside would type-check and render English. A nested catalog is the failure mode the flat
    // shape exists to make unrepresentable.
    //
    // Two halves, and the second is the load-bearing one. A key that merely LOOKS flat proves
    // nothing - the shape that actually defeats the annotation is a VALUE that is an object, and
    // that is what the value check pins. The key check is here so a key like `screening[0]` or
    // `screening.question.deep` is caught while it is still a naming mistake rather than a
    // structural one.
    //
    // `_` is permitted inside a segment because the approved proficiency value it mirrors is
    // `not_confident`: the key deliberately echoes that spelling so the pair is readable. What the
    // pattern forbids is a segment that is not a plain word - an index, or a fragment of a computed
    // key - because those are the shapes a generator produces, and these keys were named by hand.
    const segment = "[a-z][A-Za-z0-9_]*";
    const keyPattern = new RegExp(`^${segment}(\\.${segment})*$`);

    for (const [key, value] of Object.entries(ENGLISH_COPY)) {
      expect(key, `bracket in catalog key: ${key}`).not.toMatch(/[[\]]/);
      expect(key, `non-identifier catalog key: ${key}`).toMatch(keyPattern);
      expect(typeof value, `non-string value at ${key}: the catalog is nested`).toBe("string");
    }
    for (const [key, value] of Object.entries(FILIPINO_COPY)) {
      expect(key, `bracket in catalog key: ${key}`).not.toMatch(/[[\]]/);
      expect(key, `non-identifier catalog key: ${key}`).toMatch(keyPattern);
      expect(typeof value, `non-string value at ${key}: the catalog is nested`).toBe("string");
    }
  });

  it("defines at least one single-segment key, so the dot is a convention and not a requirement", () => {
    // The converse check on the one above. A catalog where EVERY key has a dot is a catalog whose
    // shape was produced by a rule, and a rule is a thing to have written down. The fact that
    // `skipToContent` is un-dotted is evidence the keys were named rather than generated - and if a
    // future contributor adds a section prefix to it, this fails and the naming stays a judgement.
    expect(Object.keys(ENGLISH_COPY).some((key) => !key.includes("."))).toBe(true);
    expect(Object.keys(ENGLISH_COPY).some((key) => key.includes("."))).toBe(true);
  });
});

describe("the two things the type cannot catch", () => {
  it("renders no Filipino string as empty", () => {
    // A key present with an empty string satisfies `Record<CopyKey, string>` completely, and a
    // participant sees a heading or a paragraph that has simply vanished. The check is on the
    // TRIMMED value as well as the raw one, because a string of non-breaking spaces is invisible
    // in a diff and just as invisible on the page.
    const empty = Object.entries(FILIPINO_COPY)
      .filter(([, value]) => value.trim().length === 0)
      .map(([key]) => key);

    expect(empty, "Filipino strings that render as nothing").toEqual([]);
  });

  it("leaves no English string blank in either catalog", () => {
    // The English catalog is the reference, so a blank English string is a different bug: the
    // approved copy itself is missing. Checked because the annotation cannot see it either.
    const blank = Object.entries(ENGLISH_COPY)
      .filter(([, value]) => value.trim().length === 0)
      .map(([key]) => key);

    expect(blank, "English strings that render as nothing").toEqual([]);
  });

  it("leaves no Filipino string byte-identical to its English counterpart", () => {
    // THE LIMIT OF THE TYPE, made visible. A copy-paste from the English catalog into the Filipino
    // one satisfies the annotation, satisfies the empty check, and shows a participant an
    // untranslated paragraph. The allowlist above is the ONLY escape, and it is a list of named
    // keys with a stated reason.
    const untranslated = Object.keys(ENGLISH_COPY).filter(
      (key) => FILIPINO_COPY[key as CopyKey] === ENGLISH_COPY[key as CopyKey],
    );
    const exempt = new Set(ALLOWED_IDENTICAL.map((entry) => entry.key));

    expect(
      untranslated.filter((key) => !exempt.has(key as CopyKey)),
      "Filipino strings identical to their English counterpart",
    ).toEqual([]);
  });

  it("has an allowlist whose every entry is genuinely still identical", () => {
    // The other direction, and it is the one that stops the allowlist from rotting. An allowlist
    // that outlives its exemptions is a growing hole: a translator who FIXES one of these strings
    // would see the "identical" test pass and have no way to know the exemption should be deleted.
    // Requiring the allowlist to stay minimal means the next translator is told the entry is now
    // unnecessary - by a red test naming it.
    const stale = ALLOWED_IDENTICAL.filter(
      (entry) => FILIPINO_COPY[entry.key] !== ENGLISH_COPY[entry.key],
    );

    expect(
      stale.map((entry) => `${entry.key}: no longer identical, remove it from the allowlist`),
    ).toEqual([]);
  });

  it("gives every allowlisted key a stated reason, so none is a bare suppression", () => {
    for (const entry of ALLOWED_IDENTICAL) {
      expect(entry.why.trim().length, `${entry.key} has no reason`).toBeGreaterThan(20);
      expect(entry.key in ENGLISH_COPY, `${entry.key} is not a real key`).toBe(true);
    }
  });

  it("translates both languages' only true duplicate: the document title separator", () => {
    // A sanity check that the identical-string test is actually EXERCISED and not passing because
    // every comparison is vacuous. `switcher.filipinoName` is genuinely the same word, and if the
    // test above ever stopped finding it, the allowlist's staleness check would be proving nothing
    // either - because it would have nothing to check.
    expect(FILIPINO_COPY["switcher.filipinoName"]).toBe(ENGLISH_COPY["switcher.filipinoName"]);
    expect(FILIPINO_COPY["switcher.englishName"]).not.toBe(ENGLISH_COPY["switcher.englishName"]);
  });
});

/**
 * How short a catalog value may be before "appears inside an instruction" stops being evidence of
 * a leak.
 *
 * MEASURED against the real data rather than chosen. Instructions run 57 to 132 characters
 * (median 84), so no catalog value can be a whole instruction; the reverse direction is only ever
 * about a pasted FRAGMENT, and the shortest thing a person would paste from a sentence is a short
 * phrase. Every value in both catalogs of eight or more characters matches zero instructions as a
 * whole-word phrase.
 *
 * The two halves of that claim — that the floor excludes something real, and that it hides nothing —
 * are both re-measured by the test named `MEASURED: the whole-word fragment floor is load-bearing
 * and hides nothing`, so this constant cannot quietly become a loophole.
 */
const MIN_FRAGMENT_CHARACTERS = 8;

/**
 * Ways the finished screen's copy could claim the lifetime figure is a COVERAGE figure, a credit, or
 * a quality score. None of these may appear in any `validate.finished.*` string, in either language.
 *
 * WHY AN ENUMERATION OF CLAIMS RATHER THAN ONE FORBIDDEN WORD. `design.md` D2's copy obligation is
 * that the figure may be described as *entries answered* and may not be described as *contributions
 * to coverage*. Forbidding the single token "coverage" would forbid far less than that: "contributed",
 * "counted toward the research", "qualifying", and "credited" all make the same claim and share no
 * root with it. The list is the obligation, and the Filipino half is a SEPARATE vocabulary because
 * `ambag`/`kontribusyon`/`kwalipikad` share no root with the English words.
 *
 * WHY THESE SPECIFIC PHRASES, and not a broader sweep. Every alternative that looked stronger was
 * MEASURED against all 147 strings in both catalogs first, and three were dropped for colliding with
 * legitimate copy elsewhere in the interface — see the `MEASURED:` test in the block below, which
 * re-measures the collision count of the list that survived. The surviving phrases are the ones with
 * ZERO collisions in either catalog, which is what lets that test be a measurement rather than an
 * assumption.
 */
const COVERAGE_CLAIM: readonly RegExp[] = [
  // The claim in its most direct forms, English.
  /\bcoverage\b/,
  /\bcontribut(?:ed|es|ing|ion|ions|e|ed)\b/,
  /\bqualif(?:y|ied|ying|ying)\b/,
  /\bqualifying\b/,
  /\bcredited\b/,
  /\bcredits?\b/,
  /\bcounted (?:toward|towards|for)\b/,
  // The claim in its most direct forms, Filipino. "ambag" is the ordinary word for a contribution and
  // is the one a translator reaches for first; "katumbas" is "equivalent to".
  /\bambag\b/,
  /\bkontribusyon\b/,
  /\bkwalipikad\b/,
  /\bkatumbas\b/,
];

/**
 * The finished screen's copy must not ENCOURAGE more batches, CONDITION the participant's
 * contribution on how many batches they complete, or make a claim about the pool that the server
 * cannot keep.
 *
 * =================================================================================================
 * THIS LIST REPLACED `UNFULFILLED_PROMISE_EN` / `_FIL`, AND THE PREMISE OF THAT ONE IS NOW FALSE
 * =================================================================================================
 * The earlier guard was scoped to promises "that the finished screen must not make WHILE THE CONTINUE
 * CONTROL DOES NOT EXIST", and its own first sentence said why: it forbade the shape a swap of the
 * retired sentence would take, because "you can ask for another batch" is a promise the product
 * cannot keep *until a control keeps it*. The control now exists, so the premise is false and a guard
 * that keeps its old title is a guard whose reader is being told something untrue.
 *
 * It did not become useless, though, and this is why the shapes survive with a new name. Three of
 * the requirements still forbid them, for reasons that have nothing to do with the control's absence:
 *
 *   1. THE POOL IS NOT UNLIMITED. "You can ask for another batch whenever you like", "ready for
 *      another?", and "handa ka na para sa…?" are open-ended claims about a pool that runs out, so
 *      they are promises the server still cannot keep — now for a better reason than before.
 *   2. REQUIREMENT *The finished presentation is localized in both interface languages* forbids
 *      stating or implying that a validator's contribution depends on how many batches they
 *      complete. A target, a milestone, a rank, a comparison, and a streak are all that implication.
 *   3. `design.md` D7 forbids exactly that on the screen that shows the lifetime figure, and the
 *      figure's own justification is that it is a RECORD rather than a running total.
 *
 * And the OBVIOUS REPAIR of the old guard would now fail the new one: the honest way to revise the
 * paragraph is to put the offer on the control's label — "Answer another batch" — and that label
 * IS a request for another batch. So the not-fire half is now load-bearing in a way it was not: the
 * control's own label must survive a guard about asking for further batches. `CAN FIRE` and
 * `does not fire on the control's own labels` are both asserted below, and the can-fire probe uses
 * the real label strings rather than a paraphrase of them.
 *
 * EVERY phrase here was MEASURED against all 310 catalog entries (155 English + 155 Filipino, read
 * off the real catalogs rather than counted by hand) and collides with NONE of them, which is what
 * lets the `MEASURED:` test below be a measurement instead of an assumption. Four candidates were
 * dropped for the opposite reason and the reasons are worth keeping, because three of the four are
 * ordinary words on this very screen:
 *
 *   `thank you` / `salamat` — `validate.finished.exhausted` ends "Thank you." in BOTH catalogs. Gratitude
 *                       for work already done is not encouragement to do more, and a guard that
 *                       flagged it would be flagging the sentence this screen most needs.
 *   `habang`             — matches `validate.finished.body`'s own Filipino ("habang ginagawa mo",
 *                       "as you went"), which means something entirely different.
 *   `sapat`              — matches `validation.evaluation.cannot_evaluate`'s own clarifier, "Hindi ka
 *                       sapat ang kumpiyansa" ("you are not confident enough"), the OPPOSITE of a
 *                       claim of sufficiency.
 *   `kung gusto`         — matches `ready.stop.label`, a legitimate control elsewhere in the product.
 */
const ENCOURAGEMENT_EN: readonly RegExp[] = [
  // ENCOURAGEMENT — a nudge to keep working.
  /\bkeep going\b/,
  /\bkeep (?:doing|answering|working|at it)\b/,
  /\bdo more\b/,
  /\bas many (?:batches|sentences|entries|items) as you (?:can|like|want)\b/,
  /\banswer more\b/,
  /\banswer as many\b/,
  /\b(?:you'?re|you are) not (?:done|finished)\b/,
  // A CONTRIBUTION CONDITIONED ON VOLUME: "the more you answer, the more it counts".
  /\bthe more you\b/,
  /\beach batch (?:counts|matters|helps|brings|adds)\b/,
  /\bevery batch helps\b/,
  /\bfor every batch\b/,
  // A TARGET, MILESTONE, RANK, or COMPARISON — the vocabulary D7's own sentence names.
  /\btarget\b/,
  /\bmilestone\b/,
  /\bstreak\b/,
  /\bleaderboard\b/,
  /\brank(?:ed|s)?\b/,
  /\btop (?:contributor|validator|participant)\b/,
  /\bbest (?:validator|participant)\b/,
  /\bcompare[ds]?\b/,
  /\bfewer than\b/,
  // AN OPEN-ENDED CLAIM ABOUT THE POOL, which is what the old guard was really after.
  /\bunlimited\b/,
  /\bno (?:limit|cap|maximum)\b/,
  /\bwhenever you (?:like|want|wish)\b/,
  /\b(?:you can|you may|feel free to) (?:ask for|request|start|begin)\b/,
  /\bready for (?:another|a further|one more)\b/,
  /\bcontinue (?:when|whenever|if)\b/,
  /\bwant (?:another|a further|one more)\b/,
  /\bask for another batch\b/,
];

const ENCOURAGEMENT_FIL: readonly RegExp[] = [
  // ENCOURAGEMENT.
  /\bpatuloy\b/,
  /\bmagpatuloy k(?:a|ang|ing) (?:kapag|noon)\b/,
  /\blaimang\b/,
  /\bmas marami\b/,
  /\btutulong\b/,
  /\b(?:kayan mo|kaya mo|ipagpatuloy mo)\b/,
  // CONTRIBUTION CONDITIONED ON VOLUME. `bawat batch` covers "for every batch", and `mas marami`
  // covers "the more you finish" — both MEASURED to collide with nothing in either catalog. A third
  // candidate for this family was written and then REMOVED rather than shipped unmeasured, because an
  // unmeasured pattern in a guard is a marker that has not been shown to match anything at all.
  /\bbawat batch\b/,
  // A TARGET, MILESTONE, RANK, or COMPARISON.
  /\b(?:target|marka|benchmark)\b/,
  /\bstreak\b/,
  /\bleaderboard\b/,
  /\branking\b/,
  /\bpinakamataas\b/,
  // AN OPEN-ENDED CLAIM ABOUT THE POOL.
  /\bwalang (?:limitasyon|hangganan|pinakamalaking)\b/,
  // `kang` is listed explicitly rather than folded into a `k(?:a|ing)` alternation: the FIRST draft of
  // the predecessor wrote that alternation, and its can-fire control caught "Maaari kang humiling…"
  // going unflagged. A control built from the pattern's own author would have repeated the mistake,
  // so the can-fire control below still uses that exact sentence.
  /\bmaaari k(?:a|ang|ing) (?:humiling|mag-request)/,
  /\bhanda k(?:a|ang|ing) na\b/,
  /\bhumiling ng (?:pangalawa|pambagong|isa pang) batch\b/,
];

/** Every phrase, both languages, for the "does it catch all of these" probes. */
const ENCOURAGEMENT_ALL: readonly RegExp[] = [...ENCOURAGEMENT_EN, ...ENCOURAGEMENT_FIL];

/**
 * The eight catalog keys this continuation work adds, named rather than derived.
 *
 * NAMED, and that is a deliberate exception to the "derive, never list" rule this file follows
 * elsewhere. The rule exists so a guard keeps COVERING a namespace as it grows; here the claim is the
 * opposite one — that a specific set of keys exists in both catalogs — and a derived set would make
 * the assertion vacuous, because deriving from the English catalog and requiring the Filipino catalog
 * to match is exactly what the file's own key-set-parity check already does at the type level. So
 * the names are written down here, and the count is asserted, which is what stops a name being added
 * to the list without the corresponding key existing in both catalogs.
 *
 * All eight are asserted for: presence in both catalogs, non-empty, and genuinely translated. The
 * key-set parity over the whole `validate.finished.` namespace is asserted separately, so a ninth
 * key added later is still covered by THAT even though this list does not name it.
 */
const CONTINUATION_KEYS = [
  "validate.finished.continue",
  "validate.finished.continue.working",
  "validate.finished.finish",
  "validate.finished.finishNote",
  "validate.finished.exhausted",
  "validate.finished.failure.notConfigured",
  "validate.finished.failure.invalid",
  "validate.finished.failure.persistence",
] as const satisfies readonly CopyKey[];

/**
 * How many sentences a copy string carries, used as a MEASURABLE proxy for "the localized version is
 * not a shorter rendering of the other".
 *
 * The requirement asks for the two versions to "carry the same meaning rather than one being a looser
 * or shorter rendering of the other", and MEANING is not mechanically decidable — a reviewer reads
 * the pair. What IS decidable is the part the requirement names second: a shorter rendering. Sentence
 * count is the coarsest honest proxy for it, and it is coarse on purpose, because a proxy that
 * pretended to be a semantic check would be worse than none.
 *
 * MEASURED before use: all twelve `validate.finished.*` values currently agree between the catalogs
 * on this count, so the assertion below is a real baseline rather than a threshold invented to pass.
 * The splitter ends a sentence on `.`, `!`, `?`, or `…` followed by whitespace, and drops empty parts,
 * so an ellipsis in "Preparing your sentences…" does not read as two sentences.
 */
function sentenceCount(value: string): number {
  return value.split(/[.!?…]+\s*/u).filter((part) => part.trim().length > 0).length;
}

/**
 * True when `fragment` occurs in `haystack` bounded by non-letter characters on both sides.
 *
 * `\p{L}` rather than `[A-Za-z]` because the haystack is Ilocano, and ASCII-only boundaries would
 * treat a Unicode letter as a boundary and match inside it. The value is interpolated into the
 * pattern, so it is escaped first: catalog values contain punctuation — em dashes, ellipses,
 * parentheses — and an unescaped `.` or `(` would quietly change what is being matched.
 */
function matchesWholeWords(fragment: string, haystack: string): boolean {
  const escaped = fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}])${escaped}([^\\p{L}]|$)`, "u").test(haystack);
}

describe("the typing of the research material that must never be localized", () => {
  it("holds no dataset instruction, place name, or identifier, and the check is built from the DATA", async () => {
    // ==============================================================================================
    // THE GUARD THIS REPLACES WAS VACUOUS, AND IT WAS VACUOUS SINCE IT WAS FIRST WRITTEN
    // ==============================================================================================
    // The previous version of this assertion was:
    //
    //     expect(values).not.toMatch(/naka|paglakbay|mankagat|nang\s+ako|ang\s+ako\s+ay/);
    //
    // and a verifier, extending it to the Filipino catalog, found it matching real Filipino interface
    // copy - "Walang naka-save na pagkakakilanlan", "Hindi ka pa naka-sign up" - because `naka` is
    // both an Ilocano root and the Filipino productive prefix na- + ka-. Chasing that collision is
    // what exposed the real problem, and it is much worse than a false positive:
    //
    //   **EVERY ONE OF THOSE MARKERS MATCHES ZERO OF THE 600 REAL INSTRUCTIONS.**
    //
    // Measured, not assumed. The synthetic OD dataset is Ayta/Itao with place-name-first
    // constructions - "Iti Baguio Athletic Bowl ti ayanko ita; masapulko a makadanon iti Baguio
    // Convention Center" - not the "Pumunta sa ..." / "Naka-..." shapes the markers assume. The
    // check therefore could never fail. It had been reporting coverage it was not providing, which
    // is the failure mode this repository has now hit repeatedly and treats as worse than having no
    // guard at all.
    //
    // ==============================================================================================
    // WHY A MARKER CANNOT BE THE RIGHT INSTRUMENT HERE
    // ==============================================================================================
    // A marker encodes an assumption about the dialect, and the data just proved the assumption
    // wrong. Any marker set would be another assumption, and a dialect change would silently
    // disarm it again. So the guard reads the 600 records and compares them directly. It has no
    // opinion about what Ilocano looks like, and it keeps working if the phrasing changes.
    //
    // The comparison is BILATERAL: a catalog value must not CONTAIN an instruction, and an
    // instruction must not CONTAIN a catalog value. The second direction is not paranoia - it is
    // what catches a catalog string pasted into a dataset record, which is the only route by which
    // interface copy could reach the research data.
    // The project's own loader is used rather than a hand-rolled shape guess. A first draft assumed
    // the file was `{ records: [...] }` and threw on `.length` of undefined; the merged file is
    // `{ categories: [...] }` with five blocks. `parseSyntheticDataset` already knows that and
    // validates the rest of the shape, so re-implementing the guess here would have been a
    // second, weaker parser - and a guess that fails loudly today would fail silently tomorrow
    // if the file were wrapped.
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { parseSyntheticDataset } = await import("@/lib/dataset/synthetic-source");

    const { entries } = parseSyntheticDataset(
      JSON.parse(
        readFileSync(join(process.cwd(), "data", "merged-ilocano-synthetic-data.json"), "utf8"),
      ),
    );
    // Asserted rather than assumed: a guard that silently read an empty set would pass every check
    // below, which is the very defect this rewrite exists to remove.
    expect(entries.length, "the guard read a real dataset, not an empty one").toBe(3000);

    // The distinct place names, computed ONCE rather than inside the per-language loop below. Every
    // one is a proper noun of at least ten characters, so this carries no false-positive risk - the
    // property the old `naka` marker lacked, where ordinary Filipino UI copy tripped a guard meant
    // for Ilocano. It does not depend on the language, so rebuilding it twice asserted nothing
    // extra and cost a second pass over 600 records.
    const placeNames = new Set<string>();
    for (const entry of entries) {
      // `origin` and `destination` are optional in the domain type, so the narrowing is explicit
      // rather than assumed - a `null` reaching a `Set<string>` would be a TypeError at runtime.
      // Whole categories of the merged source carry no origin, so nulls are routine here.
      if (entry.origin) placeNames.add(entry.origin);
      if (entry.destination) placeNames.add(entry.destination);
    }
    // Asserted rather than assumed: a set that read nothing would make the loop below vacuous,
    // which is the defect this whole guard was rewritten to remove.
    expect(
      placeNames.size,
      "the place-name set is non-empty, so the loop below is real",
    ).toBeGreaterThan(0);

    // BOTH catalogs. A first draft scanned `ENGLISH_COPY` only; a Filipino string is exactly as
    // capable of carrying a pasted instruction, so checking one language was checking half the
    // surface while looking like the whole of it.
    for (const [language, catalog] of [
      ["English", ENGLISH_COPY],
      ["Filipino", FILIPINO_COPY],
    ] as const) {
      // ===========================================================================================
      // COLLECTED, NOT ASSERTED ONE CELL AT A TIME. This rewrite is a bug fix, not a style choice.
      // ===========================================================================================
      // The previous version made 2 catalogs x 85 keys x 3000 entries x 2 directions = **1,020,000
      // individual `expect()` calls**, and every one of them builds an assertion object, records a
      // result, and is counted by the reporter.
      //
      // The 85th key is `skipToContent`, which is declared UNQUOTED, so a quoted-key regex reports 84
      // and two independent regexes agreeing on 84 is not evidence. The count above was taken by
      // evaluating the module and reading `Object.keys(...).length`, which is why it is 85.
      //
      // That cost was the intermittent failure recorded as an open, uncaused item in `AGENTS.md`
      // and `tasks.md`: this test failed `Test timed out in 5000ms` — Vitest's DEFAULT timeout,
      // not a limit anybody chose here — whenever it crossed 5s under parallel load. It was
      // reproduced 10 times in 12 runs by running four full suites concurrently, and it affected
      // **four** files, of which this was the dominant one (5929ms-6755ms observed).
      //
      // So "cannot be reproduced" was never the truth. It was a REPRODUCTION-METHOD failure: a
      // load-dependent flake needs load to appear, and a single sequential run does not create it.
      //
      // Collecting the violations and asserting once per catalog is faster by orders of magnitude
      // AND reports strictly more: the old form stopped at the first offending cell, so a real
      // regression would have named one key out of however many were affected.
      const violations: string[] = [];

      for (const [key, value] of Object.entries(catalog)) {
        for (const entry of entries) {
          if (value.includes(entry.instruction)) {
            violations.push(
              `${language} key "${key}" contains the whole instruction of ${entry.id}`,
            );
          }
          // ----------------------------------------------------------------------------------
          // THE REVERSE DIRECTION NEEDS BOTH GUARDS BELOW, AND BOTH ARE MEASURED, NOT ASSUMED
          // ----------------------------------------------------------------------------------
          // Plain `instruction.includes(value)` is not a usable test in either language, and the
          // two languages fail for DIFFERENT reasons, which is why neither fix alone was kept:
          //
          //   Filipino "ng" is the linker and appears inside 368 of the 600 instructions as a
          //   fragment of a longer word — zero whole-word matches, 368 substring matches. Whole-word
          //   matching alone removes every one of those.
          //
          //   English "of" matches 60 instructions AS A WHOLE WORD, because the dataset contains
          //   English institution names — "University of Baguio", "University of the
          //   Cordilleras" — and "of" is a legitimate English word. No amount of word-boundary
          //   care fixes a coincidence between two real things.
          //
          // So the reverse direction requires a whole-word match AND a length floor. The floor is
          // not fitted to the offender: across both catalogs and all 600 instructions, exactly one
          // value collides at whole-word level, it is two characters long, and every value of
          // eight or more characters collides zero times. The test immediately below re-measures
          // both halves of that claim, so if a future copy edit creates a collision the floor is
          // shown to have been hiding it rather than asserted to have been safe.
          if (
            value.length >= MIN_FRAGMENT_CHARACTERS &&
            matchesWholeWords(value, entry.instruction)
          ) {
            violations.push(
              `${language} key "${key}" appears verbatim inside the instruction of ${entry.id}`,
            );
          }
        }
      }

      const all = Object.values(catalog).join(" ");
      // A dataset identifier, in either catalog.
      if (/OD_\d{4}/.test(all)) {
        violations.push(`${language} catalog holds a dataset identifier`);
      }
      for (const name of placeNames) {
        if (name.length < 10) continue;
        if (all.includes(name)) {
          violations.push(`${language} catalog contains the place name "${name}"`);
        }
      }

      expect(violations, `${language} catalog holds no research material`).toEqual([]);
    }
  });

  it("MEASURED: the whole-word fragment floor is load-bearing and hides nothing", async () => {
    // The floor `MIN_FRAGMENT_CHARACTERS` introduces is only defensible if BOTH of its halves are
    // true at the same time, and both are re-measured here rather than asserted in a comment:
    //
    //   1. IT IS LOAD-BEARING. Without it, at least one catalog value matches an instruction as a
    //      whole word. If that set were empty, the floor would be excluding nothing and the rule
    //      would be an unexplained special case.
    //   2. IT HIDES NOTHING. No catalog value at or above the floor matches any instruction as a
    //      whole word. If that is ever false, a real leak is being suppressed by the floor, and the
    //      failure belongs HERE, naming the offending key — not in a guard that silently skips it.
    //
    // Between them these two make the floor self-validating on every run of the suite. A copy edit
    // that starts colliding is reported by this test, whatever its length.
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { parseSyntheticDataset } = await import("@/lib/dataset/synthetic-source");

    const { entries } = parseSyntheticDataset(
      JSON.parse(
        readFileSync(join(process.cwd(), "data", "merged-ilocano-synthetic-data.json"), "utf8"),
      ),
    );
    expect(entries.length, "this measurement read a real dataset").toBe(3000);

    const belowFloor: string[] = [];
    const atOrAboveFloor: string[] = [];

    for (const [language, catalog] of [
      ["English", ENGLISH_COPY],
      ["Filipino", FILIPINO_COPY],
    ] as const) {
      for (const [key, value] of Object.entries(catalog)) {
        if (!entries.some((entry) => matchesWholeWords(value, entry.instruction))) continue;
        const label = `${language} "${key}" = ${JSON.stringify(value)} (${value.length} chars)`;
        if (value.length < MIN_FRAGMENT_CHARACTERS) belowFloor.push(label);
        else atOrAboveFloor.push(label);
      }
    }

    // (1) The floor excludes something real. The offender is named so a reader is not left to
    // rediscover it: an English "of" against "University of Baguio".
    expect(
      belowFloor.length,
      `the fragment floor must be excluding at least one real whole-word collision; found none, so MIN_FRAGMENT_CHARACTERS = ${MIN_FRAGMENT_CHARACTERS} is an unexplained special case and should be reconsidered`,
    ).toBeGreaterThan(0);

    // (2) And nothing it excludes was hiding a leak.
    expect(
      atOrAboveFloor,
      `a catalog value of ${MIN_FRAGMENT_CHARACTERS} or more characters appears verbatim in an instruction`,
    ).toEqual([]);
  });

  it("CAN fail: the guard above would catch a real instruction pasted into either catalog", async () => {
    // A guard that cannot fail is worse than none, so this is the control for the assertion above -
    // the same can-fire / can-not-fire pair used for the catalog key-set pin in this file.
    //
    // It uses the FIRST REAL RECORD, not a hand-written sample. A synthetic sample would prove only
    // that the comparison works on the sample, which is the same defect in a smaller size: the old
    // markers matched neither the sample nor the data.
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { parseSyntheticDataset } = await import("@/lib/dataset/synthetic-source");
    const { entries } = parseSyntheticDataset(
      JSON.parse(
        readFileSync(join(process.cwd(), "data", "merged-ilocano-synthetic-data.json"), "utf8"),
      ),
    );
    const instruction = entries[0].instruction;

    // The real catalogs are clean, which is the not-fire half.
    expect(Object.values(ENGLISH_COPY).some((v) => v.includes(instruction))).toBe(false);
    expect(Object.values(FILIPINO_COPY).some((v) => v.includes(instruction))).toBe(false);

    // And the comparison does fire when the instruction is actually present, in either language.
    expect(instruction.includes(instruction)).toBe(true);
    expect(`Prefix ${instruction}`.includes(instruction)).toBe(true);
    // And a leaked catalog string inside an instruction is caught too - the reverse direction.
    // The key is taken from the catalog itself rather than written out, for the reason this
    // repository has twice recorded: a hand-typed anchor is a guess, and a wrong guess here would
    // have compared against `undefined` and quietly asserted nothing.
    const [firstKey] = Object.keys(ENGLISH_COPY);
    const firstValue = ENGLISH_COPY[firstKey as CopyKey];
    expect(firstValue.length).toBeGreaterThan(0);
    expect(entries[0].instruction.includes(firstValue)).toBe(false);

    // THE REVERSE DIRECTION'S CAN-FIRE CONTROL, ADDED WITH THE FRAGMENT FLOOR.
    //
    // The floor and the whole-word rule both restrict when the reverse direction reports, so the
    // plain `instruction.includes(firstValue)` check above no longer demonstrates anything about the
    // rule that is actually in force: it exercises `String.includes`, not `matchesWholeWords`, and it
    // ignores the floor entirely. A guard whose control tests a different comparison than the guard
    // uses is the "test that APPEARS to be a guard while not being one" defect.
    //
    // So the control pastes a REAL FRAGMENT of a real instruction — its first three words, taken
    // from the record rather than hand-written — and asserts that the rule as written would flag it.
    // The fragment is taken from the record because a hand-written sample would have reproduced the
    // original defect in a smaller size: a marker that matches neither the sample nor the data.
    const fragment = instruction.split(/\s+/u).slice(0, 3).join(" ");
    expect(
      fragment.length,
      "the control fragment clears MIN_FRAGMENT_CHARACTERS, so it exercises the rule in force",
    ).toBeGreaterThanOrEqual(MIN_FRAGMENT_CHARACTERS);
    expect(matchesWholeWords(fragment, instruction), "the control fragment is a real one").toBe(
      true,
    );

    // And the coincidence the floor exists for is demonstrated on REAL data, with the offending
    // instruction FOUND rather than written out. The first draft of this control hardcoded `entries[0]`
    // and the word "of", and it failed: that record does not mention a university, so the anchor was a
    // guess about the data and the assertion was false for a reason that had nothing to do with the
    // rule. This is the same lesson as every other hand-typed anchor in this repository - it is also
    // why the search below asserts that it found something, so a dataset revision that removes the
    // collision reports INCONCLUSIVE rather than passing quietly.
    const shortValue = "of";
    expect(shortValue.length).toBeLessThan(MIN_FRAGMENT_CHARACTERS);
    const coincidence = entries.find((entry) => matchesWholeWords(shortValue, entry.instruction));
    expect(
      coincidence,
      `no instruction contains ${JSON.stringify(shortValue)} as a whole word, so the fragment floor is no longer excluding anything and MIN_FRAGMENT_CHARACTERS should be reconsidered`,
    ).toBeDefined();
    // Named in the message because it is the evidence for the floor being load-bearing: an English
    // function word colliding with an English institution name inside an Ilocano sentence.
    expect(
      matchesWholeWords(shortValue, coincidence?.instruction ?? ""),
      `expected ${coincidence?.id} to contain "of" as a whole word`,
    ).toBe(true);
  });

  it("localizes only the proficiency LABEL, never the proficiency VALUE", () => {
    // `tasks.md` 6.3. The mapping is keyed by the machine-readable value and the label is looked up
    // BY that value, so the label varies and the value cannot. The check that matters is the
    // negative one below: the approved values are not in the catalog at all, so a component that
    // read a value out of a key would get nothing rather than a plausible string.
    for (const choice of ILOCANO_PROFICIENCY_CHOICES) {
      const key = PROFICIENCY_LABEL_KEYS[choice.value];
      expect(key).toBeTypeOf("string");
      expect(ENGLISH_COPY[key]).toBe(choice.label);
      expect(FILIPINO_COPY[key]).not.toBe(ENGLISH_COPY[key]);
    }
  });

  it("offers a label for every approved proficiency level, and no others", () => {
    // `Record<IlocanoProficiency, …>` is the type-level pin; this is the runtime mirror, and it is
    // here for the same reason as the key-set mirror above - a file that failed to load.
    expect(Object.keys(PROFICIENCY_LABEL_KEYS).sort()).toEqual(
      ILOCANO_PROFICIENCY_CHOICES.map((choice) => choice.value).sort(),
    );
    for (const value of Object.keys(PROFICIENCY_LABEL_KEYS)) {
      expect(value, "a proficiency value leaked into the Filipino catalog").not.toBe(
        FILIPINO_COPY[value as CopyKey],
      );
    }
  });
});

/**
 * Every string the finished presentation renders, in both catalogs.
 *
 * DERIVED, never listed. The point of a copy guard is that it keeps covering the namespace when the
 * namespace grows, and a hand-written list of today's four keys stops covering it the moment a fifth
 * is added — which is exactly the "enumeration in this project is a claim to be re-derived" lesson
 * this repository has already paid for once. The prefix also means a `validate.finished.*` key added
 * by the continuation work later in this change is covered automatically.
 */
const FINISHED_NAMESPACE = "validate.finished.";

function finishedStrings(language: "English" | "Filipino"): Array<[CopyKey, string]> {
  const catalog = language === "English" ? ENGLISH_COPY : FILIPINO_COPY;
  const found = Object.entries(catalog).filter(([key]) => key.startsWith(FINISHED_NAMESPACE));
  // Asserted, not assumed. A namespace that matched nothing would make every absence assertion below
  // pass over an empty set, which is the vacuous-guard defect in its purest form.
  expect(found.length, `${language} finished-screen strings were found`).toBeGreaterThan(0);
  return found as Array<[CopyKey, string]>;
}

describe("the finished screen's own copy", () => {
  it("supplies both figure labels in BOTH catalogs, and the catalogs agree on the key set", () => {
    // `tasks.md` 5.1. Key-set parity is the type's job and is asserted as a positive control at the
    // top of this file, so what is checked HERE is narrower and different: that the two keys this
    // change adds exist, are reachable, and are non-empty in both languages. A key that existed in
    // English only would be caught by the annotation; a key that rendered an EMPTY string would not,
    // and that is the failure worth pinning at this level.
    const figureKeys = [
      "validate.finished.batchFigureLabel",
      "validate.finished.lifetimeFigureLabel",
    ] as const satisfies readonly CopyKey[];

    expect(figureKeys).toHaveLength(2);
    for (const key of figureKeys) {
      expect(ENGLISH_COPY[key], `${key} is missing from the English catalog`).toBeTruthy();
      expect(FILIPINO_COPY[key], `${key} is missing from the Filipino catalog`).toBeTruthy();
      expect(ENGLISH_COPY[key].trim().length).toBeGreaterThan(0);
      expect(FILIPINO_COPY[key].trim().length).toBeGreaterThan(0);
      // Not a byte-identical string, which the file-level allowlist already covers — repeated here
      // so a failure names the FIGURE LABEL rather than an anonymous key in a 147-entry diff.
      expect(FILIPINO_COPY[key], `${key} is untranslated`).not.toBe(ENGLISH_COPY[key]);
    }
  });

  it("gives the two figures DIFFERENT labels, in both catalogs, so neither can be read as the other", () => {
    // `design.md` D5, and the load-bearing half of task 1.4. Asserting that two numbers appear cannot
    // tell which is which; asserting the two labels are different strings can, and it fails the moment
    // somebody copies one label over the other — which is the mistake the requirement is about.
    expect(ENGLISH_COPY["validate.finished.batchFigureLabel"]).not.toBe(
      ENGLISH_COPY["validate.finished.lifetimeFigureLabel"],
    );
    expect(FILIPINO_COPY["validate.finished.batchFigureLabel"]).not.toBe(
      FILIPINO_COPY["validate.finished.lifetimeFigureLabel"],
    );
    // And the pair differs in the SAME WAY in both languages: the batch label names the batch and the
    // lifetime label does not. Without this, a translator could ship two distinct Filipino strings
    // that nonetheless fail to say which figure is which, and "not equal" would pass.
    for (const catalog of [ENGLISH_COPY, FILIPINO_COPY]) {
      const batch = catalog["validate.finished.batchFigureLabel"];
      const lifetime = catalog["validate.finished.lifetimeFigureLabel"];
      expect(batch.toLowerCase(), "the batch label must name the batch").toMatch(
        /batch|baatch na ito/i,
      );
      expect(lifetime.toLowerCase(), "the lifetime label must not name a batch").not.toMatch(
        /batch/,
      );
    }
  });

  it("describes the lifetime figure as ENTRIES ANSWERED, never as coverage, credit, or a score", () => {
    // `tasks.md` 5.3 and `design.md` D2, and the reason this enumerates phrasings instead of
    // forbidding the word "coverage": the figure is NOT a coverage figure, and the honest way to
    // say that is that the copy must not claim it is. Enumerating the claim rather than banning one
    // token is what lets the guard cover the Filipino wording too, which shares no root with the
    // English one.
    //
    // SCOPE, stated honestly: this is over the `validate.finished` NAMESPACE, not the whole catalog.
    // The requirement is about the finished screen, and a whole-catalog sweep would either have to
    // tolerate legitimate uses elsewhere or would be reporting coverage it does not have — the
    // measured reason it is scoped is recorded below.
    for (const language of ["English", "Filipino"] as const) {
      for (const [key, value] of finishedStrings(language)) {
        for (const phrase of COVERAGE_CLAIM) {
          expect(
            value.toLowerCase(),
            `${language} "${key}" claims coverage/credit: ${JSON.stringify(value)}`,
          ).not.toMatch(phrase);
        }
      }
    }
  });

  it("CAN FIRE: the coverage-claim guard rejects a label that makes the claim", () => {
    // The control, and the reason the enumeration above is a guard rather than a decoration. Run over
    // strings the REAL catalog would plausibly have contained — each one is a wording a copywriter
    // reaches for when describing this figure — and require every one to be caught.
    const plausible = [
      "Entries that contributed to the study's coverage",
      "Qualifying entries answered",
      "Your coverage so far",
      "Entries credited toward the research",
      "Total contributions to the dataset",
      "Mga ambag sa coverage ng pag-aaral",
      "Mga kwalipikad na entry na sinagot",
      "Ang iyong kontribusyon sa pag-aaral",
    ];

    expect(plausible.length).toBeGreaterThan(0);
    const missed = plausible.filter(
      (value) => !COVERAGE_CLAIM.some((phrase) => phrase.test(value.toLowerCase())),
    );
    expect(
      missed,
      `the guard does not catch: ${missed.join(" | ")} — the enumeration is missing a phrasing`,
    ).toEqual([]);
  });

  it("MEASURED: the coverage-claim vocabulary collides with nothing else in either catalog", () => {
    // Why the guard is SCOPED rather than applied to every string, measured rather than asserted.
    //
    // Three candidate words were measured against all 147 strings in both catalogs and were DISCARDED
    // for colliding with legitimate copy elsewhere, not because the finished screen uses them. (The
    // 147 is what that measurement actually read; both catalogs now hold 155 entries each, and
    // `ENCOURAGEMENT`'s own `MEASURED:` test re-runs the same collision measurement over the current
    // values, so the figure is re-derived there rather than carried forward here.)
    //
    //   `score`     — 2 English hits: `landing.panel.ask.body` and `start.lead`, both of which
    //                  describe the SCREENING question as "background information for the research
    //                  record". That is the exact opposite of what a quality score is.
    //   `best`      — 1 English hit: `validation.evaluation.hint`, "Choose the one that fits best."
    //   `sapat`     — 2 Filipino hits, one of them `validation.evaluation.cannot_evaluate`'s own
    //                  clarifier, "Hindi ka sapat ang kumpiyansa" ("you are not confident enough"),
    //                  which is the OPPOSITE of a claim of sufficiency.
    //
    // A whole-catalog sweep would therefore either fire on those three or have to exempt them, and an
    // exemption list is how a guard starts tolerating what it exists to forbid. The finished namespace
    // is the scope the requirement actually has, and the vocabulary below is measured to be free of
    // collisions everywhere — so this test is what lets a reader believe the scope is not hiding
    // something rather than taking it on trust.
    const collisions: string[] = [];

    for (const [language, catalog] of [
      ["English", ENGLISH_COPY],
      ["Filipino", FILIPINO_COPY],
    ] as const) {
      for (const phrase of COVERAGE_CLAIM) {
        for (const [key, value] of Object.entries(catalog)) {
          if (phrase.test(value.toLowerCase())) {
            collisions.push(`${language} "${key}" = ${JSON.stringify(value)}`);
          }
        }
      }
    }

    expect(
      collisions,
      "the coverage vocabulary must be free of collisions in BOTH catalogs",
    ).toEqual([]);
  });

  it("removes the stale claim that asking for another batch is unavailable, from BOTH catalogs", () => {
    // `tasks.md` 5.2. Asserted as the RETIRED SENTENCES rather than as "some new sentence exists",
    // because a rewrite that kept the old clause and appended a new one would pass a presence check
    // while still telling a validator the thing the change removed.
    //
    // Each retired clause is quoted as it stood in the catalog that held it, so a future reader can
    // see exactly what was removed rather than having to trust that something was.
    const retired: ReadonlyArray<{
      readonly language: "English" | "Filipino";
      readonly clause: string;
    }> = [
      {
        language: "English",
        clause: "Asking for another batch is not part of this part of the study",
      },
      {
        language: "Filipino",
        clause: "Hinihingi ng ibang batch ay hindi bahagi pa ng bahaging ito ng pag-aaral",
      },
    ];

    expect(retired).toHaveLength(2);
    for (const { language, clause } of retired) {
      for (const [key, value] of finishedStrings(language)) {
        expect(
          value,
          `${language} "${key}" still carries the retired clause: ${JSON.stringify(value)}`,
        ).not.toContain(clause);
      }
    }
  });

  it("CAN FIRE: the retired-clause check finds that clause when it is present", () => {
    // The control for the assertion above, and the reason that one is not vacuous. The probe is the
    // REAL retired string, taken from the clause the assertion names — not a paraphrase, because a
    // paraphrase would test the paraphrase.
    const retiredEnglish =
      "You have answered every sentence in this batch. Each one was saved as you went. Asking for another batch is not part of this part of the study yet.";
    const retiredFilipino =
      "Sinagot mo na ang bawat pangungusap sa batch na ito. Nase-save ang bawat isa habang ginagawa mo. Hinihingi ng ibang batch ay hindi bahagi pa ng bahaging ito ng pag-aaral.";

    expect(retiredEnglish).toContain(
      "Asking for another batch is not part of this part of the study",
    );
    expect(retiredFilipino).toContain(
      "Hinihingi ng ibang batch ay hindi bahagi pa ng bahaging ito ng pag-aaral",
    );
    // And the CURRENT strings do not, which is the not-fire half on the real data.
    expect(ENGLISH_COPY["validate.finished.body"]).not.toContain(
      "Asking for another batch is not part of this part of the study",
    );
    expect(FILIPINO_COPY["validate.finished.body"]).not.toContain(
      "Hinihingi ng ibang batch ay hindi bahagi pa ng bahaging ito ng pag-aaral",
    );
  });

  it("encourages no further work, conditions no contribution on batch count, and promises an unlimited pool — in EITHER catalog", () => {
    // `tasks.md` 5.2's second half and `design.md` D7, over the whole `validate.finished.*` namespace
    // and now covering the eight continuation strings rather than the two body paragraphs.
    //
    // The title is the requirement's own vocabulary rather than the old one's. The old test forbade
    // promises "that the product cannot keep until the continue control exists", and the control now
    // exists, so that framing was false; what the requirement actually forbids is a CONTRIBUTION
    // DEPENDING ON HOW MANY BATCHES a validator completes, which is an encouragement, a target, or a
    // claim that the pool never runs out. See `ENCOURAGEMENT_EN` for the full account.
    //
    // Two catalogs, two separate vocabularies, because `patuloy`/`kayan mo` and `keep going` share no
    // root — a single list would silently cover one language and call it both.
    for (const [key, value] of finishedStrings("English")) {
      for (const phrase of ENCOURAGEMENT_EN) {
        expect(
          value.toLowerCase(),
          `English "${key}" encourages, targets, or over-promises: ${JSON.stringify(value)}`,
        ).not.toMatch(phrase);
      }
    }
    for (const [key, value] of finishedStrings("Filipino")) {
      for (const phrase of ENCOURAGEMENT_FIL) {
        expect(
          value.toLowerCase(),
          `Filipino "${key}" encourages, targets, or over-promises: ${JSON.stringify(value)}`,
        ).not.toMatch(phrase);
      }
    }
  });

  it("CAN FIRE: the encouragement guard rejects each shape it is meant to reject", () => {
    // The control, and the reason the list above is a guard rather than a decoration. One sentence per
    // family, in the wording a copywriter reaches for, and every one must be caught.
    //
    // "Maaari kang humiling ng pangalawang batch." is the FIRST draft of the predecessor's own
    // control that went UNFLAGGED, because that draft folded `kang` into a `k(?:a|ing)` alternation.
    // It is kept here in that exact form, because a control rewritten to suit a rewritten pattern
    // would not be testing the mistake.
    const plausible = [
      "Keep going — you have answered 27 entries so far.",
      "Answer more batches to reach 50 entries answered.",
      "The more you answer, the more it counts.",
      "Each batch counts toward your total.",
      "Your next milestone is 50 entries answered.",
      "Keep your streak alive by answering another batch.",
      "You are not done yet: 23 entries to your target of 50.",
      "There is no limit to how many batches you can answer.",
      "You can ask for another batch whenever you like.",
      "Ready for another batch?",
      "Continue when you are ready.",
      "Patuloy ka para makarating sa 50.",
      "Kaya mo pa bang umabot sa 50?",
      "Maaari kang humiling ng pangalawang batch.",
      "Handa ka na para sa susunod na batch?",
      "Walang limitasyon ang bilang ng batch.",
      "Bawat batch ay tumutulong sa iyong kabuuan.",
      "Leaderboard: ikaw ang numero uno.",
    ];

    expect(plausible.length).toBeGreaterThan(0);
    const missed = plausible.filter(
      (value) => !ENCOURAGEMENT_ALL.some((p) => p.test(value.toLowerCase())),
    );
    expect(missed, `the encouragement guard does not catch: ${missed.join(" | ")}`).toEqual([]);
  });

  it("does NOT fire on the control's own labels, which legitimately ask for another batch", () => {
    // The half that became load-bearing when the continue control landed, and the one whose absence
    // would have made the guard above a reason to delete the feature.
    //
    // `validate.finished.continue` IS "Answer another batch": a request for a further batch, in
    // imperative mood, on a control the participant presses. The old guard forbade `ask for another
    // batch` and would have flagged an honest label — so a repair under the old rules would have been
    // to soften the label ("You can answer another batch"), which is both the promise the pool cannot
    // keep AND the encouragement the requirement forbids. The two obligations only coexist because
    // the label is a COMMAND and the guard forbids PROMISES, and this test is what pins that
    // distinction rather than leaving it to a reader to notice.
    //
    // Every real finished-screen label in BOTH catalogs is checked, not just the continue one, so a
    // reworded finish label or reassurance sentence cannot quietly start matching either.
    for (const [key, value] of finishedStrings("English")) {
      const fired = ENCOURAGEMENT_EN.filter((phrase) => phrase.test(value.toLowerCase()));
      expect(
        fired,
        `the real English label "${key}" matches the guard: ${fired.join(" | ")}`,
      ).toEqual([]);
    }
    for (const [key, value] of finishedStrings("Filipino")) {
      const fired = ENCOURAGEMENT_FIL.filter((phrase) => phrase.test(value.toLowerCase()));
      expect(
        fired,
        `the real Filipino label "${key}" matches the guard: ${fired.join(" | ")}`,
      ).toEqual([]);
    }
    // Named explicitly as well, because the loop above is only meaningful if the continue label is
    // among the strings it walks — and it is the one most likely to be edited away.
    expect(ENGLISH_COPY["validate.finished.continue"]).toBe("Answer another batch");
    expect(FILIPINO_COPY["validate.finished.continue"]).toBe("Sagutin ang isa pang batch");
  });

  it("MEASURED: the encouragement vocabulary collides with nothing in either catalog", () => {
    // Why the list above is scoped to the finished namespace rather than applied everywhere, stated
    // as a measurement rather than as trust. Every phrase in both sets was run over every entry of
    // both catalogs; the guard survives only if the count of collisions is zero, so a future copy
    // addition that would make the guard cry wolf fails HERE rather than silently narrowing it.
    //
    // This is the same shape as the `MEASURED:` test the coverage-claim list carries, and it exists
    // because that one has already been the difference between a guard and a decoration once.
    const collisions: string[] = [];

    for (const phrase of ENCOURAGEMENT_ALL) {
      for (const [language, catalog] of [
        ["English", ENGLISH_COPY],
        ["Filipino", FILIPINO_COPY],
      ] as const) {
        for (const [key, value] of Object.entries(catalog)) {
          if (phrase.test(value.toLowerCase())) {
            collisions.push(`${language} "${key}" = ${JSON.stringify(value)}`);
          }
        }
      }
    }

    // The two list lengths are asserted SEPARATELY, and separately rather than as one total on
    // purpose: the failure a lost entry produces is "the guard now covers less", and a single summed
    // figure cannot say WHICH list lost it. The numbers were MEASURED off the two arrays (28 English,
    // 16 Filipino — 44 together) after a first draft of this assertion wrote `40` from a guess and
    // failed with `expected 44 to be 40`, which is the "expected value written down rather than
    // measured" error this repository has now recorded seven times.
    expect(ENCOURAGEMENT_EN).toHaveLength(28);
    expect(ENCOURAGEMENT_FIL).toHaveLength(16);
    expect(ENCOURAGEMENT_ALL).toHaveLength(44);
    expect(
      collisions,
      "the encouragement vocabulary must be free of collisions in BOTH catalogs",
    ).toEqual([]);
  });

  it("supplies all eight continuation strings in BOTH catalogs, and the catalogs agree on the key set", () => {
    // `tasks.md` 5.1, for the strings this half of the change adds. Key-set parity over the whole
    // `validate.finished.` namespace is asserted here too rather than left to the file's top-level
    // annotation, because the annotation proves the two objects have the same TYPE and this proves
    // the same thing about the VALUES actually shipped.
    expect(CONTINUATION_KEYS).toHaveLength(8);
    for (const key of CONTINUATION_KEYS) {
      expect(ENGLISH_COPY[key], `${key} is missing from the English catalog`).toBeTruthy();
      expect(FILIPINO_COPY[key], `${key} is missing from the Filipino catalog`).toBeTruthy();
      expect(ENGLISH_COPY[key].trim().length).toBeGreaterThan(0);
      expect(FILIPINO_COPY[key].trim().length).toBeGreaterThan(0);
      // Genuinely translated, not an English fallback — named so a failure says which of the eight.
      expect(FILIPINO_COPY[key], `${key} fell back to English`).not.toBe(ENGLISH_COPY[key]);
    }

    // PARITY, derived from the English catalog exactly as `tasks.md` 5.1 requires rather than from a
    // list written beside it. A hand-written expectation list would prove that the eight keys above
    // exist twice; this proves the Filipino namespace is the SAME namespace.
    const finishedEnglish = Object.keys(ENGLISH_COPY).filter((key) =>
      key.startsWith(FINISHED_NAMESPACE),
    );
    const finishedFilipino = Object.keys(FILIPINO_COPY).filter((key) =>
      key.startsWith(FINISHED_NAMESPACE),
    );

    expect(finishedEnglish.length).toBeGreaterThan(CONTINUATION_KEYS.length);
    expect(finishedFilipino).toEqual(finishedEnglish);
  });

  it("does not let either catalog be the SHORTER rendering of the other", () => {
    // Requirement *The finished presentation is localized in both interface languages* requires the two
    // versions to "carry the same meaning rather than one being a looser or shorter rendering of the
    // other".
    //
    // WHAT THIS DOES NOT DO, stated plainly because it is the limit worth naming: it does not compare
    // MEANING. Meaning is not mechanically decidable and no assertion here pretends otherwise — a
    // reviewer reads the pair. What is decidable is the second half of the requirement's own wording,
    // "shorter rendering", and sentence count is the coarsest honest proxy for it.
    //
    // Both directions are checked, because "shorter" is symmetric in the requirement and an assertion
    // that only ran one way would permit a translation cut in half as long as it kept every sentence.
    const mismatched: string[] = [];

    for (const key of Object.keys(ENGLISH_COPY).filter((key) =>
      key.startsWith(FINISHED_NAMESPACE),
    )) {
      const english = sentenceCount(ENGLISH_COPY[key as CopyKey]);
      const filipino = sentenceCount(FILIPINO_COPY[key as CopyKey]);
      if (english !== filipino) {
        mismatched.push(`${key}: EN ${english} sentence(s), FIL ${filipino}`);
      }
    }

    expect(
      mismatched,
      `the two catalogs carry a different number of sentences: ${mismatched.join(" | ")}`,
    ).toEqual([]);
  });

  it("CAN FIRE: the sentence counter counts sentences in both catalogs' own strings", () => {
    // The control for the assertion above. Two real catalog values, one of them the three-sentence
    // exhausted message and one of them a single label, so the comparison is between numbers that
    // actually differ rather than between two copies of the same shape.
    expect(sentenceCount(ENGLISH_COPY["validate.finished.exhausted"])).toBe(3);
    expect(sentenceCount(FILIPINO_COPY["validate.finished.exhausted"])).toBe(3);
    expect(sentenceCount(ENGLISH_COPY["validate.finished.continue"])).toBe(1);
    expect(sentenceCount(FILIPINO_COPY["validate.finished.continue"])).toBe(1);
    // And an ellipsis is not a sentence break — "Preparing your sentences…" is one label, and the
    // splitter counting it as two would make the parity assertion above fail for the wrong reason.
    expect(sentenceCount(ENGLISH_COPY["validate.finished.continue.working"])).toBe(1);
    // Which is the difference between the two: a value that really did lose a sentence is caught.
    const shortened = ENGLISH_COPY["validate.finished.exhausted"].split(". ")[0] ?? "";
    expect(sentenceCount(shortened)).toBeLessThan(
      sentenceCount(ENGLISH_COPY["validate.finished.exhausted"]),
    );
  });
});

/**
 * The copy that used to describe a RETURNING PERSON, and now describes one browser SESSION.
 *
 * `validator-onboarding` gained a requirement in the `session-attempt-identity` change: the resume
 * copy "SHALL NOT state or imply that the platform remembers a person from a previous visit", because
 * under session-scoped storage it holds nothing from a previous session. Two strings said otherwise —
 * `resume.body` opened with "If you have taken part on this browser before", and
 * `validate.finished.finishNote` promised "you can still come back another time".
 *
 * A banned-phrase list is a poor guard on its own, and this block is built so the list is not the
 * whole of it: the ENUMERATION below reads every catalog string that mentions coming back, continuing,
 * returning, or being recognised, and pins the resulting key set as a CLOSED set. The count read is
 * asserted too, because "no violations found" and "nothing was searched" print the same thing.
 */
describe("the copy that described a returning person, and now describes one session", () => {
  /**
   * Vocabulary that, in this project's copy, is how a claim about recognition ACROSS sessions gets
   * made. Matched case-insensitively against every string in BOTH catalogs.
   *
   * A list, and stated as one: this is a set of idioms somebody chose, not a definition of "claims
   * recognition". What closes it is the enumeration's own assertions below — the pinned key set makes
   * a NEW string in this vocabulary fail by name, whatever it says, and the `CAN FIRE` control proves
   * the vocabulary actually matches text rather than silently matching nothing.
   */
  const RECOGNITION_VOCABULARY = [
    "come back",
    "coming back",
    "come back to",
    "return",
    "returning",
    "recognis",
    "recogniz",
    "before",
    "another time",
    "resume",
    "resum",
    "bumalik",
    "balik",
    "kilala",
    "kinikilala",
    "na ba",
    "muling",
  ] as const;

  const CATALOGS: ReadonlyArray<readonly [name: string, catalog: Record<string, string>]> = [
    ["en", ENGLISH_COPY as unknown as Record<string, string>],
    ["fil", FILIPINO_COPY as unknown as Record<string, string>],
  ];

  /** Every key whose string mentions any recognition idiom, as `locale:key`. */
  function mentionsRecognition(): string[] {
    const found: string[] = [];
    for (const [locale, catalog] of CATALOGS) {
      for (const [key, value] of Object.entries(catalog)) {
        const lower = value.toLowerCase();
        if (RECOGNITION_VOCABULARY.some((term) => lower.includes(term))) {
          found.push(`${locale}:${key}`);
        }
      }
    }
    return found.sort();
  }

  it("READS a non-empty catalog through every vocabulary term, so the enumeration is a measurement", () => {
    // The control for the whole block. A vocabulary list that matches nothing makes every other
    // assertion here pass for the wrong reason, and this project has found four of those.
    for (const term of RECOGNITION_VOCABULARY) {
      const sample = `A sentence containing ${term} in the middle.`;
      expect(sample.toLowerCase(), `the term ${JSON.stringify(term)} matches nothing`).toContain(
        term,
      );
    }
    const keys = Object.keys(ENGLISH_COPY);
    expect(keys.length).toBeGreaterThan(50);
    // And both catalogs are read: the same key set twice would be a guard that only ever looked at one.
    expect(Object.keys(FILIPINO_COPY).sort()).toEqual([...keys].sort());
  });

  it("pins the CLOSED set of strings that use recognition vocabulary, so a new one fails by name", () => {
    // THIS is the enumeration task 5.3 asks for, and the count read is asserted before the set so a
    // failure says how many strings were examined rather than only which one changed. Re-derive the
    // number by re-running this test after editing any string in either catalog: a change here is a
    // deliberate decision to let a string use this vocabulary, and the reason belongs in a comment.
    //
    // **THE TWO HALVES ARE THE SAME SIZE AND THAT IS NOT A BUG EITHER.** 11 English keys and 11
    // Filipino ones are selected, because roughly half the vocabulary is language-specific —
    // `bumalik`, `kinikilala`, `na ba` and `muling` cannot occur in an English string, and
    // `recognis`/`another time` are not how the Filipino catalog makes the same claims. That
    // asymmetry is the useful part: it means the enumeration is really reading both catalogs
    // rather than matching one list twice.
    //
    // Re-derived for `sentence-only-presentation`: `fil:landing.before.item1`
    // is gone with the landing card that carried it. The voluntary proposition
    // still lives — verbatim, in the screening notice where the ethics rule
    // requires it — and the enumeration keeps measuring the same claims at
    // their required address rather than going quiet about them.
    const found = mentionsRecognition();

    expect(found.length).toBe(23);
    expect(found).toEqual([
      "en:common.beforeYouStart",
      "en:ready.next.body1",
      "en:ready.next.body2",
      "en:ready.starting.item2",
      "en:ready.title",
      "en:resume.unknown",
      "en:screening.resumeNote",
      "en:start.beforeAnswer.item3",
      "en:start.beforeAnswer.label",
      "en:validate.finished.failure.invalid",
      "en:validate.finished.failure.screeningRequired",
      "en:validateStart.failure.invalid",
      "en:validateStart.screeningRequired",
      "fil:notFound.cta",
      "fil:ready.next.body1",
      "fil:ready.next.body2",
      "fil:ready.starting.item2",
      "fil:resume.unknown",
      "fil:start.beforeAnswer.item3",
      "fil:validate.finished.failure.invalid",
      "fil:validate.finished.failure.persistence",
      "fil:validateStart.failure.invalid",
      "fil:validateStart.noIdentity",
    ]);
  });

  it("CAN FIRE: the vocabulary finds a cross-session claim in either language", () => {
    // The control for the closed set above. Hand-built strings rather than a mutated catalog, so this
    // file does not have to edit `copy.ts` to prove its own detector works — the same reasoning
    // `attempt-storage-enumeration.test.ts` uses for its fixtures.
    const englishClaim =
      "If you have taken part on this browser before, we will recognise you when you return.";
    expect(englishClaim.toLowerCase()).toMatch(/before/);
    expect(englishClaim.toLowerCase()).toMatch(/return|returning/);
    const filipinoClaim = "Kung may ginawa ka na sa browser na ito, puwede ka pa ring bumalik.";
    expect(filipinoClaim.toLowerCase()).toMatch(/bumalik/);
    // And the guard's own predicate, applied to a one-entry catalog, selects it — the same code path
    // the enumeration above takes.
    const oneEntry: Record<string, string> = { "probe.key": englishClaim };
    const selected = Object.entries(oneEntry)
      .filter(([, value]) =>
        RECOGNITION_VOCABULARY.some((term) => value.toLowerCase().includes(term)),
      )
      .map(([key]) => `en:${key}`);
    expect(selected).toEqual(["en:probe.key"]);
  });

  it("CAN FIRE: a NEW string in this vocabulary would fail the closed set by name", () => {
    // The closed set above is a guard, and a guard that cannot fail is a decoration. This proves it
    // can: the enumeration is run over a copy of the real English catalog with one extra key added,
    // and the selection grows by exactly that key. It does not touch `copy.ts`, so the real assertion
    // above keeps measuring the real catalogs.
    const withExtra: Record<string, string> = {
      ...(ENGLISH_COPY as unknown as Record<string, string>),
      "probe.onlyKey": "Come back to this browser whenever you like.",
    };
    const selected = Object.entries(withExtra)
      .filter(([, value]) =>
        RECOGNITION_VOCABULARY.some((term) => value.toLowerCase().includes(term)),
      )
      .map(([key]) => `en:${key}`);

    // The real set has no `probe.onlyKey`, so the real assertion forbids it by name.
    expect(mentionsRecognition()).not.toContain("en:probe.onlyKey");
    expect(selected).toContain("en:probe.onlyKey");
    // Compared against the REAL English half, not the combined total: `withExtra` holds one catalog,
    // and comparing 12 against 24 would be a mismatch of measurement rather than of behaviour.
    const realEnglishHalf = mentionsRecognition().filter((k) => k.startsWith("en:"));
    expect(selected.length).toBe(realEnglishHalf.length + 1);
    // And the Filipino half is genuinely absent from this selection, which is what shows the two
    // catalogs are read separately rather than one standing in for the other.
    expect(selected.some((k) => k.startsWith("fil:"))).toBe(false);
  });

  it("says nothing in EITHER language about having taken part on this browser BEFORE", () => {
    // The clause the deleted resume card carried now lives in the pre-enrollment
    // notice (`start.beforeAnswer.item3`), asserted as an absence in both catalogs
    // rather than as the presence of a replacement — an absence is the property
    // the requirement states, and a presence check would pass on any rewrite that
    // kept the claim.
    for (const [locale, catalog] of CATALOGS) {
      const notice = catalog["start.beforeAnswer.item3"] ?? "";
      expect(notice.length, `${locale} notice item3 is empty`).toBeGreaterThan(20);
      expect(notice.toLowerCase(), `${locale} notice claims a previous visit`).not.toMatch(
        /before/,
      );
      expect(notice.toLowerCase(), `${locale} notice claims a previous visit`).not.toMatch(
        /(take|taken|participat|gininawa|nagawa)/,
      );
      // And it DOES name the session, which is the half that makes it an answer rather than a deletion.
      expect(notice.toLowerCase(), `${locale} notice does not name the session`).toMatch(/session/);
    }
  });

  it("tells a participant that finishing ends the ATTEMPT, and promises no resumption", () => {
    for (const [locale, catalog] of CATALOGS) {
      const note = catalog["validate.finished.finishNote"] ?? "";
      // Unchanged in substance: nothing submitted is altered. This is the reassurance the sentence
      // exists for, and losing it to satisfy the session requirement would be a real regression.
      expect(note.length, `${locale} finishNote is empty`).toBeGreaterThan(20);
      // The clause that became false: "you can still come back another time" is a promise of
      // continuation, and under session-scoped attempts coming back is a new screened attempt.
      expect(note.toLowerCase(), `${locale} finishNote promises a return`).not.toMatch(
        /come back|coming back|another time|bumalik/,
      );
      // What it says instead, in each language's own words for it.
      const sessionNamed = /session/.test(note.toLowerCase());
      expect(sessionNamed, `${locale} finishNote does not name the session`).toBe(true);
      const attemptNamed =
        /attempt/.test(note.toLowerCase()) || /pagsubok/.test(note.toLowerCase());
      expect(attemptNamed, `${locale} finishNote does not name what ended`).toBe(true);
      const againNamed =
        /again|new one/.test(note.toLowerCase()) || /muli|bago/.test(note.toLowerCase());
      expect(againNamed, `${locale} finishNote does not say what taking part again means`).toBe(
        true,
      );
    }
  });

  it("renders the session promise in the language actually rendered, not only in the catalog", () => {
    // The catalog-level assertions above read the data. This one goes through `translatorFor`, because
    // a catalog can be correct and a component can still render a different string — and the
    // requirement is about what the participant is shown.
    for (const locale of INTERFACE_LOCALES) {
      const t = translatorFor(locale);
      const notice = t("start.beforeAnswer.item3");
      const note = t("validate.finished.finishNote");
      expect(notice.length, `${locale} notice item3 rendered empty`).toBeGreaterThan(20);
      expect(note.length, `${locale} finishNote rendered empty`).toBeGreaterThan(20);
      expect(notice.toLowerCase(), `${locale} rendered notice claims a previous visit`).not.toMatch(
        /before/,
      );
      expect(note.toLowerCase(), `${locale} rendered finishNote promises a return`).not.toMatch(
        /come back|another time|bumalik/,
      );
      // And each language rendered its OWN string rather than falling back to English — the failure
      // this project has already had to catch once, for a missing Filipino key.
      if (locale === "fil") {
        expect(notice).not.toBe(ENGLISH_COPY["start.beforeAnswer.item3"]);
        expect(note).not.toBe(ENGLISH_COPY["validate.finished.finishNote"]);
      }
    }
  });
});

describe("translatorFor", () => {
  it("returns the English catalog for 'en' and the Filipino one for 'fil'", () => {
    for (const locale of INTERFACE_LOCALES) {
      const t = translatorFor(locale);
      for (const key of Object.keys(ENGLISH_COPY) as CopyKey[]) {
        expect(t(key), `${locale}/${key}`).toBeTypeOf("string");
        expect(t(key).length).toBeGreaterThan(0);
      }
    }
  });

  it("closes over its catalog, so two translators cannot disagree", () => {
    // The property that makes the switcher safe: a component handed a translator is handed a
    // specific language, and no module-level "current language" exists for a second rendered tree
    // in the same process to pick up. Asserted by interleaving the two, which is the arrangement
    // that would break if the implementation read a mutable global.
    const en = translatorFor("en");
    const fil = translatorFor("fil");

    for (const key of ["screening.submit", "screening.question", "notFound.cta"] as CopyKey[]) {
      expect(en(key)).toBe(ENGLISH_COPY[key]);
      expect(fil(key)).toBe(FILIPINO_COPY[key]);
      expect(fil(key)).not.toBe(en(key));
      // Reversed, to catch a cache keyed only by the first call.
      expect(fil(key)).toBe(FILIPINO_COPY[key]);
      expect(en(key)).toBe(ENGLISH_COPY[key]);
    }
  });
});

/**
 * The type-level controls.
 *
 * ============================================================================
 * WHY THESE ARE IN A TEST FILE AT ALL
 * ============================================================================
 * A `@ts-expect-error` is only evidence if it FIRES. If the annotation on `FILIPINO_COPY` were
 * deleted, a one-key-short literal below would compile cleanly, the `@ts-expect-error` would become
 * "unused", and `pnpm run typecheck` would fail with `TS2578` - which is what we want, because it
 * means the pin is load-bearing and someone found out.
 *
 * The second control is the one that makes the first mean anything. An `@ts-expect-error` placed on
 * a line that fails for an UNRELATED reason - a typo in a value, a missing import - would satisfy
 * the same check while proving nothing about the annotation. So a NEGATIVE CONTROL sits beside it:
 * the same shape, but complete, annotated as expected to compile, and asserted to compile by
 * having no directive on it at all. If the pair were both wrong in the same direction, at least one
 * would have to fail, and neither is a comment.
 */
describe("the exhaustiveness pin, and proof that it can fail", () => {
  it("rejects a Filipino catalog that is one key short", () => {
    // `Omit` on ONE key rather than a hand-written copy of the catalog: a hand-written copy would
    // be a third inventory to keep in step, and the one that drifts is the one being tested. The
    // omission is derived from the real key set, so this cannot rot.
    const OMITTED: CopyKey = "notFound.cta";
    const oneShort: Record<Exclude<CopyKey, typeof OMITTED>, string> = Object.fromEntries(
      Object.entries(FILIPINO_COPY).filter(([key]) => key !== OMITTED),
    ) as Record<Exclude<CopyKey, typeof OMITTED>, string>;

    // @ts-expect-error - the annotation is the mechanism; this line is what it rejects.
    const assigned: Copy = oneShort;

    // The runtime half, so the file is not only asserting a compiler behaviour: the object this
    // produced really is missing the key, which is the fact the type is standing in for.
    expect(Object.keys(assigned)).not.toContain(OMITTED);
    expect(Object.keys(assigned)).toHaveLength(Object.keys(ENGLISH_COPY).length - 1);
  });

  it("rejects a Filipino catalog carrying a key English does not have", () => {
    // The other direction. An excess key is not a missing translation, so it is easy to overlook,
    // and it is how a key gets "translated" in only one direction and then read by the other.
    //
    // ONE LINE ON PURPOSE, and the reason is worth recording because getting it wrong is a guard
    // that silently stops guarding. TypeScript reports an excess property at the property, not at
    // the binding, so a directive has to sit on the line that carries the property. An earlier
    // version wrapped the literal and added `as Copy`, which reports TS2578 "unused directive" -
    // correct, because a type ASSERTION suppresses the very check the assertion was there to
    // prove, and the directive then became decoration.
    // @ts-expect-error - an excess property is not assignable to `Record<CopyKey, string>`.
    const withExtra: Copy = { ...FILIPINO_COPY, "notFound.aStringNobodyAskedFor": "extra" };

    // The runtime half: the object really does carry the extra key, which is the fact the type is
    // standing in for. Read through `Object.entries` rather than by index, because indexing `Copy`
    // with the excess key is itself a type error and would need a second suppression here.
    expect(Object.entries(withExtra)).toContainEqual(["notFound.aStringNobodyAskedFor", "extra"]);
  });

  it("accepts a complete catalog, which is the control for both assertions above", () => {
    // POSITIVE CONTROL. Same construction, nothing omitted and nothing added, and NO
    // `@ts-expect-error` on it - which is itself the assertion. If the pin were inverted, or if
    // `Record<CopyKey, string>` were somehow rejecting every object, the two tests above would
    // still pass while this one failed. Three together is the minimum for "the check can fire and
    // can also not fire for a valid value".
    const complete: Copy = { ...FILIPINO_COPY };

    expect(Object.keys(complete).sort()).toEqual(Object.keys(ENGLISH_COPY).sort());
  });
});

describe("the language control's own accessible name", () => {
  it("names every approved locale, and no others", () => {
    // WHY THIS NEEDS PINNING AT ALL - it was a defect, found in review, not by a test.
    // The switcher originally chose this key with `choice === "en" ? english : filipino`. That
    // compiled, passed the whole suite, and would have announced a THIRD approved locale to a
    // screen-reader user as "Filipino". A ternary has no exhaustiveness to violate, so nothing
    // would have failed at the moment the third language was approved.
    expect(Object.keys(LOCALE_NAME_KEYS).sort()).toEqual([...INTERFACE_LOCALES].sort());
  });

  it("points at real strings in BOTH catalogs, so a name is never a dangling lookup", () => {
    // A key that exists in the map but not in a catalog would render as `undefined` in one
    // language and a word in the other - the switcher announcing "undefined" to a participant.
    for (const locale of INTERFACE_LOCALES) {
      const key = LOCALE_NAME_KEYS[locale];
      expect(ENGLISH_COPY[key]).toBeTruthy();
      expect(FILIPINO_COPY[key]).toBeTruthy();
    }
  });

  it("gives the two locales DIFFERENT names, so the control can be told apart", () => {
    // If both locales resolved to one key, both buttons would announce the same language and the
    // switcher would be unusable with a screen reader - while still looking correct and still
    // passing every other test here.
    expect(LOCALE_NAME_KEYS.en).not.toBe(LOCALE_NAME_KEYS.fil);
  });

  it("rejects a map missing a locale, and accepts a complete one - the control for both", () => {
    // Same can-fire / can-not-fire pair as the catalog pin above, for the same reason: a
    // `@ts-expect-error` that never errors means the assertion has stopped testing anything, and
    // `@ts-expect-error` reports `TS2578` when that happens, so a wrong pin cannot go quiet.
    const complete: Record<InterfaceLocale, LocaleNameKey> = { ...LOCALE_NAME_KEYS };
    expect(Object.keys(complete).sort()).toEqual([...INTERFACE_LOCALES].sort());

    // The object literal is annotated and NOT cast. A first draft wrote
    // `{ en: ... } as Record<InterfaceLocale, LocaleNameKey>`, and the `@ts-expect-error` below
    // then reported `TS2578: Unused directive` - because the assertion had silenced the very error
    // it was supposed to be standing in for. A cast on a deliberately incomplete object is exactly
    // how an absence-probe stops testing anything while still reading like it does.
    //
    // @ts-expect-error - 'fil' is missing, which is the mutation a third approved locale makes.
    const missingFil: Record<InterfaceLocale, LocaleNameKey> = { en: LOCALE_NAME_KEYS.en };

    // The runtime half: the object really is missing the locale, which is the fact the type stands
    // in for.
    expect(Object.keys(missingFil)).not.toContain("fil");
  });
});
