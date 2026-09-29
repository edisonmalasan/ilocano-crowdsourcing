# Design System — Soft Neo-Brutalism

This document records the resolved visual system, **including the design-skill directives that
were deliberately overridden and what replaced them**. It exists so that later changes build on a
decided system instead of re-deriving one, and so a reviewer can see every place the project
chose research integrity or accessibility over a reference aesthetic.

The tokens themselves live in `src/styles/globals.css` inside a Tailwind v4 `@theme` block. That
block **is** the system: component code contains no raw colour, no raw shadow, and no raw radius.
`tests/unit/design-system.test.ts` enforces that mechanically.

---

## 1. The synthesis, and why

The repository ships two design skills. Applied verbatim, **neither one produces soft
neo-brutalism**, and both are explicitly constrained by `docs/ROADMAP.md`.

- **`industrial-brutalist-ui`** supplies the *structural* language: bold visible borders, hard
  zero-blur offset shadows, visible compartmentalisation, monospace micro-typography, strong
  typographic hierarchy, a mathematically-engineered grid.
- **`high-end-visual-design`** supplies the *refinement*: restraint, generous whitespace, careful
  hierarchy, a readable body face, and short considered motion.

### Directives overridden, and what replaced them

| # | Reference directive | Verdict | Resolution here | Why |
| --- | --- | --- | --- | --- |
| 1 | "Absolute rejection of `border-radius`. All corners must be exactly 90 degrees." | **Overridden** | `--radius-control: 10px`, `--radius-card: 12px`, `--radius-sheet: 18px` | The roadmap requires *slightly softened* corners and forbids the hard industrial interpretation. Square corners also read as harsh next to warm cream. |
| 2 | "Choose ONE substrate… Tactical Telemetry: `#0A0A0A` dark mode exclusivity." | **Overridden** | Single light warm substrate (`--color-paper: #f4efe4`). No dark substrate token exists. | The roadmap forbids terminal/military aesthetics and requires warm/light neutral surfaces. Offering a dark variant would also violate "never mix light and dark substrates". |
| 3 | "Accent: `#E61919` aviation/hazard red. This is the ONLY accent color." | **Overridden** | One copper accent (`--color-accent: #9c4a12`) plus a brass step, with sage/clay reserved for genuine status | The roadmap requires *restrained* accents and forbids excessive red/black. Hazard red also carries a false-severity connotation in a research tool. |
| 4 | "Gradients, soft drop shadows, and modern translucency are strictly prohibited." | **Kept** | Shadows are solid, fully opaque, zero-blur offsets. No gradients anywhere. | Hard offset shadows are core to the neo-brutalist language. |
| 5 | "Halftone, 1-Bit Dithering, CRT Scanlines, Mechanical Noise." | **Overridden, one element kept** | A single low-opacity (0.035) fixed paper-grain overlay | Grain adds tactility. Halftone/CRT/scanlines are terminal aesthetic and are rejected outright. The grain overlay is `position: fixed`, `pointer-events: none`, and attached to nothing that scrolls. |
| 6 | "ASCII characters framing data points: `[ DELIVERY SYSTEMS ]`, `>>>`, `///`." | **Overridden** | Small-caps monospace labels only (`label-meta`) | The roadmap explicitly rejects military/terminal framing. Uppercase tracked monospace carries the same "technical metadata" signal without the fiction. |
| 7 | "Massive scale `clamp(4rem, 10vw, 15rem)`, uppercase, line-height 0.85." | **Overridden for prose, kept for display** | `--text-display` caps at `5rem` and is used for headings only | The roadmap forbids giant novelty typography for body content. Body text has a hard `1rem` floor and never scales fluidly. |
| 8 | "Giant, bloated, rounded-full pill buttons." | **Overridden** | `--radius-control: 10px` buttons, minimum 44px touch target | A pill button is not neo-brutalist. Touch-target size is kept — it is an accessibility requirement, not an aesthetic one. |
| 9 | "Double-Bezel / nested glass-plate architecture, `backdrop-blur` shells." | **Overridden** | Flat surfaces with a 2px ink border and a hard offset shadow | `backdrop-blur` is expensive on mobile GPUs and is explicitly a "premium agency" tell that fights the brutalist language. |
| 10 | "Scroll-reveal choreography, 700ms `cubic-bezier(0.32,0.72,0,1)`, staggered mask reveals." | **Overridden** | 100–180ms opacity/transform transitions only | The roadmap requires subtle and fast motion and forbids attention-seeking animation. Reveal choreography is also a distraction during a 10-item judging task. |
| 11 | "Banned fonts: Inter, Roboto, Arial, Open Sans, Helvetica." | **Kept** | `Archivo` (display), `Public Sans` (body), `JetBrains Mono` (metadata) | No default UI font is used anywhere. |
| 12 | "Section padding at minimum `py-24`." | **Adjusted** | `--section-y`: 3rem → 5rem → 7.5rem, mobile-first | Generous, but bounded: a validator must not scroll past the sentence they are judging. |
| 13 | "Section spacing `py-24`–`py-40`, scroll entry animations present on every element." | **Overridden** | No scroll-triggered animation | `IntersectionObserver` reveals would fire during a batch and compete with the task. |

---

## 2. The token set

### Surfaces (light, warm, single substrate)

| Token | Value | Use |
| --- | --- | --- |
| `--color-paper` | `#f4efe4` | Page background |
| `--color-paper-raised` | `#fbf8f1` | Cards, inputs, header/footer |
| `--color-paper-sunken` | `#e9e2d3` | Inset panels, pressed states, track backgrounds |
| `--color-paper-inset` | `#ded5c2` | Deepest pressed state |

### Ink

All four steps clear **WCAG AA (≥ 4.5:1)** against `--color-paper`.

| Token | Value | Use |
| --- | --- | --- |
| `--color-ink` | `#1a1712` | Body text, all borders, all shadows |
| `--color-ink-muted` | `#57503f` | Secondary prose |
| `--color-ink-faint` | `#6e6656` | Metadata, placeholders |

### Accent and status

| Token | Value | Use |
| --- | --- | --- |
| `--color-accent` | `#9c4a12` | Primary action, current progress segment |
| `--color-accent-hover` | `#853d0e` | Primary hover |
| `--color-accent-press` | `#6f330b` | Primary pressed |
| `--color-accent-tint` | `#f2e2d6` | Accent-toned card surface |
| `--color-accent-brass` | `#f0bd78` | Inner mark on a selected answer |
| `--color-status-ok` / `-tint` | `#4a6b3d` / `#e4ecdd` | Genuine success only |
| `--color-status-alert` / `-tint` | `#a33a22` / `#f4e0da` | Genuine validation error only |
| `--color-status-info` / `-tint` | `#3a5f6b` / `#dee9ed` | Genuine information only |

Status colours are **never** applied to a validation answer option.

---

## 3. Research integrity: answer-option neutrality

This is the one place where a visual decision is also a **methodological** decision, so it is
spelled out here and enforced in code.

A validator's answer is research data. If one option looked preferable, the collected judgements
would be biased, and the thesis could not treat them as independent human evaluation. The roadmap
therefore forbids "answer styling that nudges validators toward a particular evaluation", and the
`design-system` capability requires that unselected options be visually identical.

**The rule is structural, not behavioural.** `answerOptionClasses()` selects between exactly two
token sets:

- **Unselected** uses the dedicated neutral pair `--color-answer-surface` /
  `--color-answer-border`. This pair contains **no accent token at all**.
- **Selected** uses `--color-answer-selected-surface` / `--color-answer-selected-text`.

Because the neutral set cannot reach the accent, a component rendering an answer option has no way
to express a preference — not by accident, not by a later refactor. `tests/unit/design-system.test.ts`
asserts exactly this, and `tests/unit/accessibility.test.tsx` asserts that before a selection,
nothing carries `aria-checked="true"`.

Also rejected by the same rule: colouring an option by apparent correctness, sorting the options so
the agreeable one is first, and giving one option a micro-animation the others do not get.

---

## 4. Accessibility contract

- **Focus**: a single global treatment — `3px` ink ring, `2px` offset, on every focusable element.
  Visible on cream, on ink, and on copper.
- **No colour-only state**: every state is also carried by text, shape, or a semantic element.
  Progress uses a text label, a fill-vs-outline segment difference, and `role="progressbar"` with
  `aria-valuetext`. Validity uses `aria-invalid` *and* a `role="alert"` message.
- **Accessible names**: `Field` generates the id and wires `htmlFor` / `id` / `aria-describedby`,
  so a control cannot be shipped without a label.
- **Touch targets**: buttons are at least 44px tall in every variant and size.
- **Keyboard**: `AnswerGroup` is a real `role="radiogroup"` with roving `tabindex` and
  Arrow/Home/End navigation. A `not-found` navigation control is a real `<a>`, not a `<button>`,
  so Enter behaves as the role promises.
- **Zoom**: `maximumScale: 5` — pinch-zoom is not disabled, which WCAG 1.4.4 requires.
- **Reduced motion**: honoured globally; transitions are suppressed, not merely shortened.
- **Narrow viewports**: authored mobile-first, no horizontal scrolling at 320px, and body text has
  a `1rem` floor that fluid scaling cannot reduce.
- **Skip link**: first focusable element on every page.

---

## 5. What is deliberately absent

No timers. No streaks. No leaderboards. No points. No badges. No rank. No progress *rate*. The
roadmap forbids mechanics that encourage speed over careful validation, and a judging task
rewarded for speed is a judging task done badly.

No text-generating gradients, no glassmorphism, no `backdrop-blur` on content, no scroll
choreography, no terminal framing, no count-up animations, no confetti.

---

## 6. Contributing a token

1. Add it to the `@theme` block in `src/styles/globals.css` with a comment saying what it is for.
2. If it replaces or contradicts a reference-skill directive, add a row to the table in section 1.
3. If it affects a validator's perception of an answer option, get the research protocol decision
   confirmed first — that is a methodology question, not a styling one.
4. Run `pnpm run verify`. `tests/unit/design-system.test.ts` will reject raw literals.
