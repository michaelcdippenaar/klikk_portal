# Logo Exploration — Klikk Financials Console — 2026-05-25

## Design language ground rules

The Klikk Financials Console front-end is currently running Quasar defaults with no custom design tokens. This exploration establishes the visual language from scratch, constrained to what is appropriate for a calm, sovereign, operator-grade internal tool — not a consumer product. References: Linear, Pylon, Mercury Console. South African context; Xero / Investec / TM1 workflows.

### Colour system (proposed KDL tokens for this product)

| Token name            | Light value | Dark value  | Role                                |
|-----------------------|-------------|-------------|-------------------------------------|
| `klikk-surface`       | `#F5F1EB`   | `#141210`   | Page / header canvas                |
| `klikk-ink`           | `#1A1917`   | `#E8E3DC`   | Primary text, marks, strokes        |
| `klikk-ink-secondary` | `#1A1917` @ 40% | `#E8E3DC` @ 38% | Demoted labels, "financials" text |
| `klikk-divider`       | `#1A1917` @ 20% | `#E8E3DC` @ 20% | Rule lines, separators         |
| `klikk-amber`         | `#C8922A`   | `#C8922A`   | Cursor accent (D4 only — see below) |

No gradients on any primary mark. No raw Quasar blue (#1976D2) in the logo zone.

### Typography

Primary wordmark face: **Geist** (Vercel, open source — fits the operator/console register perfectly).
System-font fallback stack: `'Geist', 'Inter', ui-sans-serif, system-ui, sans-serif`

Wordmark weight: 500 (medium). Letter-spacing: −0.025em on "klikk" (tightens the double-k into a unit). Secondary labels ("financials", "console"): 400, +0.06–0.08em tracking, at 35–55% opacity.

---

## Direction 1 — The Sigma K

**Concept:** Two horizontal rails (top and bottom) connected by a diagonal stem that splits into K arms at mid-height. Reads simultaneously as a K, as a ledger with debit/credit rails, and as a stylised sigma — all three meanings coherent with finance-operator software.

**Rationale:** The double rail is a direct nod to the double-entry bookkeeping that underpins everything Klikk Financials does (every transaction has a debit rail and a credit rail). The diagonal that connects them is the K — the brand initial — doing real visual work rather than sitting as an isolated letter. At 20px it resolves to a satisfying X-through-two-lines form that reads as a confident glyph rather than a wordmark shrunk down.

**Files:**
- Mark light: `logo-exploration/d1-sigma-k-mark.svg`
- Mark dark: `logo-exploration/d1-sigma-k-mark-dark.svg`
- Lockup light: `logo-exploration/d1-sigma-k-lockup-light.svg`
- Lockup dark: `logo-exploration/d1-sigma-k-lockup-dark.svg`

**Lockup wordmark:** `klikk` (medium) + `financials` (small, 45% opacity, tracked out). The two-word split acknowledges "Klikk" as the product family and "financials" as the module — hierarchy without a subtitle line break.

**Light surface:** `klikk-ink` strokes on `klikk-surface` canvas.
**Dark surface:** `klikk-ink` (dark value) strokes on `#141210`.

**SVG path spec for the mark (20×20 viewBox):**
```svg
<!-- Top rail -->
<line x1="4" y1="4.5" x2="16" y2="4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
<!-- Bottom rail -->
<line x1="4" y1="15.5" x2="16" y2="15.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
<!-- Diagonal spine: top-right to bottom-left -->
<line x1="15" y1="5.5" x2="5" y2="14.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
<!-- Upper K arm: mid-point back to top-right -->
<line x1="10" y1="10" x2="15" y2="5.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
<!-- Lower K arm: mid-point to bottom-right -->
<line x1="10" y1="10" x2="15" y2="14.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
```
Use `color: var(--klikk-ink)` in CSS context; set `currentColor` on the SVG element.

**Trade-off:** Clever but slightly busy at 20px — the five strokes are fine on retina, but may muddy on 1× 96dpi screens. Best when the header background is clean (no competing textures).

---

## Direction 2 — The Bracket

**Concept:** A pair of code brackets `[ ]` with a K drawn inside the negative space. The brackets are the primary visual element; the K is secondary but immediately recognisable.

**Rationale:** The bracket is the most universal symbol of a console, a terminal, an operator interface. It says "this is a system you control" without any literal imagery. For finance staff who spend their day in Xero and TM1, the bracket subconsciously signals structure and precision. The internal K grounds it in the Klikk family. The lockup drops "financials" and surfaces "CONSOLE" in spaced small-caps — a deliberate word choice that reinforces the tool's operator character.

**Files:**
- Mark light: `logo-exploration/d2-bracket-mark-light.svg`
- Mark dark: `logo-exploration/d2-bracket-mark-dark.svg`
- Lockup light: `logo-exploration/d2-bracket-lockup-light.svg`
- Lockup dark: `logo-exploration/d2-bracket-lockup-dark.svg`

**Lockup wordmark:** `klikk` (medium) + `CONSOLE` (9.5px, +0.06em, 38% opacity). "Financials" is intentionally absent from the lockup — in a header with limited space, "klikk CONSOLE" is sufficient and more useful as an identity signal.

**Light surface:** All strokes in `klikk-ink`. Background: `klikk-surface`.
**Dark surface:** All strokes in `klikk-ink` (dark value). Background: `#141210`.

**SVG path spec for the mark (20×20 viewBox):**
```svg
<!-- Left bracket -->
<path d="M7 3 L5 3 L5 17 L7 17"
      stroke="currentColor" stroke-width="1.5"
      stroke-linecap="round" stroke-linejoin="round" fill="none"/>
<!-- Right bracket -->
<path d="M13 3 L15 3 L15 17 L13 17"
      stroke="currentColor" stroke-width="1.5"
      stroke-linecap="round" stroke-linejoin="round" fill="none"/>
<!-- K vertical stem -->
<line x1="8.5" y1="6" x2="8.5" y2="14"
      stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>
<!-- K upper arm -->
<line x1="8.5" y1="10" x2="12" y2="6"
      stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>
<!-- K lower arm -->
<line x1="8.5" y1="10" x2="12" y2="14"
      stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>
```

**Trade-off:** The bracket mark is conceptually sharp but has more strokes than D3 or D4. At exactly 20px the inner K risks being tight on 1× screens. Works best at 24px+ where it can breathe. If the header density pass settles at 44px, this is fine; if it goes to 40px, test carefully.

---

## Direction 3 — The Ledger Block

**Concept:** A solid rounded-square container (app-icon proportion) with the K cut as white negative space inside. On dark surfaces the block inverts to warm-stone with a dark K — maintaining contrast at all times.

**Rationale:** The filled block is the highest-legibility option at 20px. It works because the K is a negative-space cutout rather than a drawn stroke — the letterform is defined by what is removed, not what is drawn. This is the same principle used by Linear's logo, Notion's N, and Vercel's triangle. The rounded-square container also positions the mark correctly if it ever needs to serve as an app icon (iOS, macOS, desktop shortcut). The lockup uses a mid-dot separator between "klikk" and "financials" — a quiet typographic device that avoids the corporate two-line stack while still conveying both words.

**Files:**
- Mark light: `logo-exploration/d3-ledger-block-mark-light.svg`
- Mark dark: `logo-exploration/d3-ledger-block-mark-dark.svg`
- Lockup light: `logo-exploration/d3-ledger-block-lockup-light.svg`
- Lockup dark: `logo-exploration/d3-ledger-block-lockup-dark.svg`

**Lockup wordmark:** `klikk` (medium, −0.025em) + `·` (mid-dot, 30% opacity) + `financials` (9.5px, +0.07em tracking, 40% opacity).

**Light surface:** Block fill `klikk-ink` (#1A1917), K stroke `klikk-surface` (#F5F1EB).
**Dark surface:** Block fill `#E8E3DC` (warm-stone), K stroke `#141210`. The block glows warmly against the dark background — no need for a border or halo.

**SVG path spec for the mark (20×20 viewBox):**
```svg
<!-- Container -->
<rect x="1" y="1" width="18" height="18" rx="4" fill="currentColor"/>
<!-- K cutout — use the inverse surface colour, not currentColor -->
<!-- Light: stroke="#F5F1EB" / Dark: stroke="#141210" -->
<line x1="6.5" y1="5.5" x2="6.5" y2="14.5"
      stroke="var(--klikk-surface)" stroke-width="1.6" stroke-linecap="round"/>
<line x1="6.5" y1="10" x2="13" y2="5.5"
      stroke="var(--klikk-surface)" stroke-width="1.6" stroke-linecap="round"/>
<line x1="6.5" y1="10" x2="13" y2="14.5"
      stroke="var(--klikk-surface)" stroke-width="1.6" stroke-linecap="round"/>
```
In implementation: the `<rect>` takes `fill="var(--klikk-ink)"` and the three lines take `stroke="var(--klikk-surface)"`. On dark mode, `--klikk-ink` resolves to `#E8E3DC` and `--klikk-surface` resolves to `#141210` — the inversion is automatic with no extra SVG variants needed if CSS custom properties are used.

**Trade-off:** The filled block is the most legible but the least "editorial" — it reads as an app icon rather than a drawn mark. Some operators may want the mark to feel lighter and less dominant in the header. This is the safe pick, not the interesting pick.

---

## Direction 4 — The Cursor K

**Concept:** A K drawn with slightly heavier strokes — proportioned like a monospaced terminal character — with a short amber underscore cursor sitting beneath it. Single accent colour (klikk-amber, #C8922A) used exclusively on the cursor line.

**Rationale:** This is the only direction that introduces a new accent colour, and it earns it: the cursor is a literal terminal metaphor that makes the "Console" positioning legible at a glance. Finance staff staring at this tool all day will subconsciously read the cursor as "I am in an active session, in control." The amber is warm rather than alarming — closer to a Bloomberg terminal indicator than a warning state. The stacked subtitle in the lockup (`financials` / `console` in two tiers) gives the lockup an information-density feel appropriate for operator software.

**On amber justification:** KDL does not currently define an accent for the Financials Console sub-brand. Amber (#C8922A) is drawn from the warm end of the stone palette — it is not an arbitrary colour. It will not clash with Quasar's positive green (#21BA45) or negative red (#C10015) in data tables because it sits in the orange-gold range that neither semantic colour occupies. It should be adopted as `klikk-financials-accent` if this direction is chosen, and used sparingly — cursor mark, active tab underline, focused input ring. Never for data (positive/negative values already own green/red).

**Files:**
- Mark light: `logo-exploration/d4-cursor-k-mark-light.svg`
- Mark dark: `logo-exploration/d4-cursor-k-mark-dark.svg`
- Lockup light: `logo-exploration/d4-cursor-k-lockup-light.svg`
- Lockup dark: `logo-exploration/d4-cursor-k-lockup-dark.svg`

**Lockup wordmark:** `klikk` (medium, −0.025em) + stacked `financials` (8px, +0.08em, 35% opacity) above `console` (8px, +0.08em, 55% opacity). The two-line stack sits to the right of "klikk" at mid-height, not below it — so the total lockup height stays within the 24px header row.

**Light surface:** K strokes `klikk-ink` (#1A1917). Cursor `klikk-amber` (#C8922A).
**Dark surface:** K strokes `#E8E3DC`. Cursor `#C8922A` — amber reads warmer and more present on dark, which is a feature not a problem.

**SVG path spec for the mark (20×20 viewBox):**
```svg
<!-- K vertical stem -->
<line x1="5.5" y1="3.5" x2="5.5" y2="14.5"
      stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
<!-- K upper arm -->
<line x1="5.5" y1="9" x2="13.5" y2="3.5"
      stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
<!-- K lower arm -->
<line x1="5.5" y1="9" x2="13.5" y2="14.5"
      stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
<!-- Cursor — hardcoded amber, not currentColor -->
<line x1="4" y1="17" x2="10" y2="17"
      stroke="#C8922A" stroke-width="2" stroke-linecap="round"/>
```

**Optional animation (CSS, not SVG):** In the implemented component, the cursor line can pulse with a simple `opacity` keyframe (1 → 0 → 1, 1.2s ease-in-out, infinite) to simulate a blinking cursor. This should be `prefers-reduced-motion` gated. It is purely optional and the mark reads fine without it.

**Trade-off:** Introduces a new accent colour that needs to be ratified and managed across the design system. If the DS ever uses amber for warning states in data tables, there will be a semantic conflict. Lock amber to structural UI chrome only if this direction is chosen.

---

## Recommendation

### Pick: Direction 3 — The Ledger Block

**Reasoning:** At the stated header constraint (20–24px lockup height, dense table-heavy UI, two finance staff staring at it all day), legibility at small size is the single most important criterion. The filled block with negative-space K wins that test cleanly. It also:

- Requires zero new colour tokens — works entirely within `klikk-ink` / `klikk-surface` already established
- Inverts automatically with a single CSS custom-property swap — no duplicate SVG assets in prod
- Positions well for future use as an app icon, browser favicon, or desktop shortcut
- Sits quietly next to nav items and the theme toggle without competing — it is a mark, not a billboard

The mid-dot lockup (`klikk · financials`) is the right tone: it names the product without being precious about it. Finance staff will ignore the wordmark within a week and navigate by muscle memory — the mark needs to be the thing that says "you are in Klikk Financials" at a peripheral-vision glance.

### Ranking of the other three

| # | Direction | One-line trade-off |
|---|-----------|-------------------|
| 2 | Cursor K (D4) | Best conceptual fit for "Console" positioning; introduces amber accent that needs DS governance before adopting |
| 3 | The Bracket (D2) | Sharpest conceptual clarity; slightly tight at 20px — works better if header height ever relaxes to 48px |
| 4 | Sigma K (D1) | Most semantically rich (debit/credit rails); five strokes make it the most fragile at small sizes — better suited to a marketing context than a 20px header mark |

### Next steps if D3 is approved

1. Replace Quasar logo placeholder in `MainLayout.vue` with the D3 SVG mark component (read-only brief — dev to implement)
2. Add `--klikk-ink`, `--klikk-surface`, `--klikk-ink-secondary` as CSS custom properties in `app.scss`, wired to Quasar's dark-mode body class
3. Update `quasar.variables.scss` `$primary` to `#1A1917` and `$dark` / `$dark-page` to `#141210` / `#1A1917`
4. Confirm with brand-strategist whether "financials" stays in the lockup or is demoted to a page `<title>` only
5. CDO sign-off before any token is used in production

---

## File index

```
docs/logo-exploration/
  d1-sigma-k-mark.svg              — D1 mark, light surface
  d1-sigma-k-mark-dark.svg         — D1 mark, dark surface
  d1-sigma-k-lockup-light.svg      — D1 horizontal lockup, light
  d1-sigma-k-lockup-dark.svg       — D1 horizontal lockup, dark
  d2-bracket-mark-light.svg        — D2 mark, light surface
  d2-bracket-mark-dark.svg         — D2 mark, dark surface
  d2-bracket-lockup-light.svg      — D2 horizontal lockup, light
  d2-bracket-lockup-dark.svg       — D2 horizontal lockup, dark
  d3-ledger-block-mark-light.svg   — D3 mark, light surface  [RECOMMENDED]
  d3-ledger-block-mark-dark.svg    — D3 mark, dark surface   [RECOMMENDED]
  d3-ledger-block-lockup-light.svg — D3 horizontal lockup, light [RECOMMENDED]
  d3-ledger-block-lockup-dark.svg  — D3 horizontal lockup, dark  [RECOMMENDED]
  d4-cursor-k-mark-light.svg       — D4 mark, light surface
  d4-cursor-k-mark-dark.svg        — D4 mark, dark surface
  d4-cursor-k-lockup-light.svg     — D4 horizontal lockup, light
  d4-cursor-k-lockup-dark.svg      — D4 horizontal lockup, dark
```
